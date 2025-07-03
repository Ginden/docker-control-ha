import { sdk } from '@internal/docker-open-api';
import { config } from '../config.mjs';
import slug from 'slug';
import { assert } from 'tsafe';

export function calculateDeviceId(data: sdk.ContainerInspectResponse): string {
  const prefix = config.HA_DEVICE_ID_PREFIX;
  let deviceId = data.Name ? slug(data.Name) : null;
  if (!deviceId) {
    deviceId = data.Id ? slug(data.Id.replace(/^\//, '')) : null;
  }

  assert(deviceId, 'Container must have a name or ID');

  const replicaNumber = data.Config?.Labels?.['com.docker.compose.container-number'] ?? '1';
  if (replicaNumber && replicaNumber !== '1') {
    deviceId += `_${replicaNumber}`;
  }

  return `${prefix}${deviceId}`;
}
