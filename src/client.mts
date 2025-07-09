import { sdk as api, createClient } from '@internal/docker-open-api';
import axios, { AxiosStatic } from 'axios';
import { statSync } from 'node:fs';
import { assert } from 'tsafe';
import * as child_process from 'node:child_process';
import { logger } from './logger.mjs';
import { config } from './config.mjs';

function createSocketClient(dockerSocketPath: string) {
  return createClient({
    baseURL: `http://localhost`, // Whatever here, I think it doesn't matter
    axios: axios.create({
      socketPath: dockerSocketPath,
    }) as AxiosStatic,
  });
}

function getSocketPath(): string {
  let envSocketPath = config.DOCKER_SOCKET_PATH;
  if (envSocketPath?.startsWith('unix://')) {
    envSocketPath = new URL(envSocketPath).pathname;
  }
  if (envSocketPath) {
    assert(
      statSync(envSocketPath).isSocket(),
      `DOCKER_SOCKET_PATH must point to a socket file, but got: ${envSocketPath}`,
    );
    return envSocketPath;
  }
  const defaultSocketPath = '/var/run/docker.sock';
  try {
    assert(statSync(defaultSocketPath).isSocket());
    logger.debug(`Using default Docker socket path: ${defaultSocketPath}`);
    return defaultSocketPath;
  } catch (error) {
    // OK, we must ask Docker itself for the socket path
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

export function createDockerApiClient(): typeof api {
  const dockerSocketPath = getSocketPath();
  const axiosClient = createSocketClient(dockerSocketPath);
  const ret: any = {};

  for (const [key, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      ret[key] = (firstArg: any, ...args: any[]) => {
        firstArg = firstArg ?? {};
        firstArg.client ??= axiosClient;
        // @ts-expect-error
        return value(firstArg, ...args);
      };
    } else {
      Object.defineProperty(ret, key, {
        get: () => {
          return (api as any)[key];
        },
      });
    }
  }

  return ret;
}
