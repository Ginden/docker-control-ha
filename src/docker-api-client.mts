import { sdk as api, createClient } from '@internal/docker-open-api';
import axios, { AxiosStatic } from 'axios';
import { statSync } from 'node:fs';
import { assert } from 'tsafe';
import * as child_process from 'node:child_process';
import { logger } from './logger.mjs';
import { config } from './config/config.mjs';

/**
 * Creates an Axios client configured to communicate with the Docker daemon via a Unix socket.
 * This is necessary because the Docker API is typically exposed over a Unix socket on Linux systems.
 * @param dockerSocketPath The absolute path to the Docker Unix socket.
 */
function createSocketClient(dockerSocketPath: string) {
  return createClient({
    baseURL: `http://localhost`, // Placeholder, as socketPath is used.
    axios: axios.create({
      socketPath: dockerSocketPath,
    }) as AxiosStatic,
  });
}

/**
 * Determines the correct Docker socket path. It checks environment variables, common defaults,
 * and Docker contexts to ensure connectivity in various setups (e.g., Docker Desktop).
 * @returns The absolute path to the Docker Unix socket.
 * @throws An error if no valid Docker socket path can be determined.
 */
function getSocketPath(): string {
  let envSocketPath = config.DOCKER_SOCKET_PATH;
  // Handle `unix://` prefix often used in Docker context configurations.
  if (envSocketPath?.startsWith('unix://')) {
    envSocketPath = new URL(envSocketPath).pathname;
  }
  // If an environment variable is provided, validate and use it.
  if (envSocketPath) {
    assert(
      statSync(envSocketPath).isSocket(),
      `DOCKER_SOCKET_PATH must point to a socket file, but got: ${envSocketPath}`,
    );
    return envSocketPath;
  }
  const defaultSocketPath = '/var/run/docker.sock';
  try {
    // Attempt to use the default path if it exists and is a socket.
    assert(statSync(defaultSocketPath).isSocket());
    logger.debug(`Using default Docker socket path: ${defaultSocketPath}`);
    return defaultSocketPath;
  } catch (error) {
    // If default path fails, inspect Docker contexts for compatibility with non-standard setups.
    const { stdout } = child_process.spawnSync('docker', ['context', 'inspect']);
    const contexts = JSON.parse(stdout.toString()) as Record<string, any>[];
    for (const context of contexts) {
      if (context.Endpoints?.docker) {
        logger.info({
          msg: `Using Docker context (first of ${contexts.length})`,
          contextName: context.Name,
          socketPath: context.Endpoints.docker.Host,
        });
        const filePath = new URL(context.Endpoints.docker!.Host!).pathname;
        assert(
          statSync(filePath).isSocket(),
          `Docker context socket path is not a socket: ${filePath}`,
        );
        return filePath;
      }
    }

    throw new Error(
      `Docker socket path not found. Please set DOCKER_SOCKET_PATH environment variable or ensure Docker is running.`,
    );
  }
}

export type DockerApiClient = typeof api;

/**
 * Creates a Docker API client instance that uses the determined Docker socket path.
 * Wraps the auto-generated SDK to inject the custom Axios client for Unix socket communication.
 */
export function createDockerApiClient(): typeof api {
  const dockerSocketPath = getSocketPath();
  const axiosClient = createSocketClient(dockerSocketPath);
  const ret: any = {};

  // Wrap auto-generated API methods to inject the custom Axios client.
  for (const [key, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      ret[key] = (firstArg: any, ...args: any[]) => {
        firstArg = firstArg ?? {};
        firstArg.client ??= axiosClient; // Inject the custom Axios client.
        // @ts-expect-error
        return value(firstArg, ...args);
      };
    } else {
      // Re-expose non-function properties.
      Object.defineProperty(ret, key, {
        get: () => {
          return (api as any)[key];
        },
      });
    }
  }

  return ret;
}
