import { sdk } from '@internal/docker-open-api';

export function extractSwVersion(data: sdk.ContainerInspectResponse) {
  const labels = data.Config?.Labels || {};
  return (
    labels['org.label-schema.version'] ??
    labels['org.opencontainers.image.version'] ??
    data?.Config?.Image ??
    null
  );
}

export function extractManufacturer(data: sdk.ContainerInspectResponse) {
  const labels = data.Config?.Labels || {};
  return labels['org.label-schema.vendor'] ?? labels['org.opencontainers.image.vendor'] ?? null;
}

export function extractModel(data: sdk.ContainerInspectResponse) {
  const labels = data.Config?.Labels || {};
  return (
    labels['org.label-schema.name'] ??
    labels['org.opencontainers.image.title'] ??
    data.Config?.Image?.split(':').at(0)
  );
}
