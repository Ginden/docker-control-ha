import { sdk } from '@internal/docker-open-api';
import { config } from '../config/config.mjs';
import slug from 'slug';
import { assert } from 'tsafe';

/**
 * Generates a unique device ID for a Docker container, suitable for Home Assistant.
 * The ID is constructed using a configurable prefix, the container's name or ID,
 * and a replica number if available. This ensures uniqueness and consistency in HA.
 * @param data The Docker container inspect response data.
 * @returns A unique device ID string.
 */
export function calculateDeviceId(data: sdk.ContainerInspectResponse): string {
  const prefix = config.HA_DEVICE_ID_PREFIX;
  // Prioritize container name for readability, fall back to ID if name is not available.
  let deviceId = data.Name ? slug(data.Name) : null;
  if (!deviceId) {
    deviceId = data.Id ? slug(data.Id.replace(/^\//, '')) : null;
  }

  assert(deviceId, 'Container must have a name or ID');

  // Append replica number for Docker Compose services to differentiate instances.
  const replicaNumber = data.Config?.Labels?.['com.docker.compose.container-number'] ?? '1';
  if (replicaNumber && replicaNumber !== '1') {
    deviceId += `_${replicaNumber}`;
  }

  return `${prefix}${deviceId}`;
}
