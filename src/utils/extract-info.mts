import { sdk } from '@internal/docker-open-api';

/**
 * Extracts the software version from Docker container labels.
 * Prioritizes standard labels (`org.label-schema.version`, `org.opencontainers.image.version`)
 * and falls back to the image name if no version label is found.
 * @param data The Docker container inspect response data.
 * @returns The software version string or null if not found.
 */
export function extractSwVersion(data: sdk.ContainerInspectResponse) {
  const labels = data.Config?.Labels || {};
  return (
    labels['org.label-schema.version'] ??
    labels['org.opencontainers.image.version'] ??
    data?.Config?.Image ??
    null
  );
}

/**
 * Extracts the manufacturer information from Docker container labels.
 * Prioritizes standard labels (`org.label-schema.vendor`, `org.opencontainers.image.vendor`).
 * @param data The Docker container inspect response data.
 * @returns The manufacturer string or null if not found.
 */
export function extractManufacturer(data: sdk.ContainerInspectResponse) {
  const labels = data.Config?.Labels || {};
  return labels['org.label-schema.vendor'] ?? labels['org.opencontainers.image.vendor'] ?? null;
}

/**
 * Extracts the model information from Docker container labels.
 * Prioritizes standard labels (`org.label-schema.name`, `org.opencontainers.image.title`)
 * and falls back to the base image name if no model label is found.
 * @param data The Docker container inspect response data.
 * @returns The model string or null if not found.
 */
export function extractModel(data: sdk.ContainerInspectResponse) {
  const labels = data.Config?.Labels || {};
  return (
    labels['org.label-schema.name'] ??
    labels['org.opencontainers.image.title'] ??
    data.Config?.Image?.split(':').at(0)
  );
}
