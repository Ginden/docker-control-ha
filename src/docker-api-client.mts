import { sdk as api, createClient } from '@internal/docker-open-api';
import axios, { AxiosStatic } from 'axios';
import {accessSync, statSync} from 'node:fs';
import { assert } from 'tsafe';
import * as child_process from 'node:child_process';
import { logger } from './logger.mjs';
import { config } from './config/config.mjs';
import * as fs from "node:fs";


function assertSocketUsable(socketPath: string): void {
  const stats = statSync(socketPath);
    assert(
        stats.isSocket(),
        `Expected ${socketPath} to be a socket, but it is not. Please check your Docker setup.`,
    );
    accessSync(socketPath, fs.constants.R_OK | fs.constants.W_OK);
}

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
    assertSocketUsable(envSocketPath);
    return envSocketPath;
  }
  const defaultSocketPath = '/var/run/docker.sock';
  try {
    // Attempt to use the default path if it exists and is a socket.
    assertSocketUsable(defaultSocketPath);
    logger.debug(`Using default Docker socket path: ${defaultSocketPath}`);
    return defaultSocketPath;
  } catch (error) {
    logger.warn({
      msg: `Default Docker socket path not found or not a socket: ${defaultSocketPath}`,
      error: error instanceof Error ? error.message : String(error),
    });
    // If a default path fails, inspect Docker contexts for compatibility with non-standard setups.
    const { stdout } = child_process.spawnSync('docker', ['context', 'inspect']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contexts = JSON.parse(stdout.toString()) as Record<string, any>[];
    for (const context of contexts) {
      if (context.Endpoints?.docker) {
        logger.info({
          msg: `Using Docker context (first of ${contexts.length})`,
          contextName: context.Name,
          socketPath: context.Endpoints.docker.Host,
        });
        const filePath = new URL(context.Endpoints.docker!.Host!).pathname;
        assertSocketUsable(filePath);
        return filePath;
      } else {
        logger.warn({
          msg: `Docker context ${context.Name} does not have a valid socket endpoint`,
          context,
        });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ret: any = {};

  // Wrap auto-generated API methods to inject the custom Axios client.
  for (const [key, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ret[key] = (firstArg: any, ...args: unknown[]) => {
        firstArg ??= {};
        firstArg.client ??= axiosClient; // Inject the custom Axios client.
        firstArg.throwOnError ??= true; // Ensure errors are thrown by default.
        // @ts-expect-error We know what we're doing here.
        return value(firstArg, ...args);
      };
    } else {
      // Re-expose non-function properties.
      Object.defineProperty(ret, key, {
        get: () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (api as any)[key];
        },
      });
    }
  }

  return ret;
}
