import { HaDiscoverableManager } from '@ginden/ha-mqtt-discoverable';
import { sdk } from '@internal/docker-open-api';
import { DockerApiClient } from './docker-api-client.mjs';
import { ContainerWrapper } from './ha/container.mjs';
import { logger } from './logger.mjs';
import {
  filterNeedsInspect,
  matchesContainerFilter,
  matchesContainerSummary,
} from './filter/container-filter.mjs';
import { assert } from 'tsafe';

/**
 * Manages Docker containers as Home Assistant entities. Responsible for discovery,
 * updates, and unregistration to keep Home Assistant in sync with Docker.
 */
export class ContainerManager {
  // Stores ContainerWrapper instances, keyed by container ID for efficient lookup.
  private readonly containersMap: Record<string, ContainerWrapper> = {};

  /**
   * @param ha The Home Assistant Discoverable Manager for entity registration.
   * @param dockerApiClient The Docker API client for daemon interaction.
   */
  public constructor(
    private readonly ha: HaDiscoverableManager,
    private readonly dockerApiClient: DockerApiClient,
  ) {}

  /**
   * Reconciles current Docker container state with Home Assistant entities.
   * Fetches latest container list, identifies changes, and updates/registers/unregisters entities.
   */
  public async refreshState(): Promise<void> {
    logger.info({ msg: 'Reconciling container state' });
    // Fetch all containers (including stopped ones); the CONTAINER_FILTER expression decides
    // which are actually exposed, so we must consider every container here.
    const { data: containers = [], status } = await this.dockerApiClient.containerList({
      query: { all: true },
    });

    assert(status === 200, `Failed to fetch containers: ${status}`);

    logger.debug({ msg: `Found ${containers.length} containers` });

    // Inspect each container and evaluate the filter. Only containers passing the filter are
    // considered "current"; everything else is treated as absent (and unregistered if it was
    // previously exposed, e.g. after a label change or the container stopping).
    const matched = (
      await Promise.all(
        containers.map(async (container) => {
          if (!container.Id) {
            logger.debug({ msg: 'Skipping container with no ID', container });
            return null;
          }
          const containerId = container.Id;

          // Cheap pre-filter on the list summary to avoid inspecting excluded
          // containers (e.g. thousands of dead testcontainers). Skipped only when
          // the filter needs inspect-only fields (raw/health).
          if (!filterNeedsInspect && !matchesContainerSummary(container)) {
            logger.debug({
              msg: `Skipping container ${containerId}: excluded by CONTAINER_FILTER (summary)`,
              container: { id: containerId, name: container.Names },
            });
            return null;
          }

          // Fetch detailed info for HA entity creation/updates and authoritative filtering.
          const containerInfo = await this.getContainerDetails(containerId);
          if (!containerInfo) {
            logger.debug({
              msg: `Skipping container ${containerId} due to missing details`,
              container: { id: containerId, name: container.Names },
            });
            return null;
          }

          if (!matchesContainerFilter(containerInfo)) {
            logger.debug({
              msg: `Skipping container ${containerId}: excluded by CONTAINER_FILTER`,
              container: { id: containerId, name: container.Names },
            });
            return null;
          }

          return { containerId, containerInfo };
        }),
      )
    ).filter((entry) => entry !== null);

    // Use sets for efficient identification of added, removed, and existing containers.
    const oldContainerIds = new Set(Object.keys(this.containersMap));
    const currentContainerIds = new Set(matched.map(({ containerId }) => containerId));
    const removedContainerIds = [...oldContainerIds].filter((id) => !currentContainerIds.has(id));

    // Unregister entities that no longer exist or no longer match the filter.
    if (removedContainerIds.length > 0) {
      logger.info({ msg: `Removing deleted, stopped or filtered-out containers`, removedContainerIds });
      await Promise.all(
        removedContainerIds.map(async (id) => {
          await this.containersMap[id].unregister();
          delete this.containersMap[id];
        }),
      );
    }

    // Process each matched container: add new ones, update existing ones.
    await Promise.all(
      matched.map(async ({ containerId, containerInfo }) => {
        // Create or retrieve ContainerWrapper for the Docker container.
        this.containersMap[containerId] ??= new ContainerWrapper(
          this.ha,
          containerInfo,
          this.dockerApiClient,
        );
        // Update the wrapper to propagate state changes to Home Assistant.
        await this.containersMap[containerId].update(containerInfo);
      }),
    );
  }

  /**
   * Returns a list of currently unhealthy containers. Used by DaemonWrapper.
   */
  public getUnhealthyContainers(): ContainerWrapper[] {
    return Object.values(this.containersMap).filter((container) => container.unhealthy);
  }

  /**
   * Unregisters all managed container entities from Home Assistant. Called on application shutdown.
   */
  public async unregisterAll(): Promise<void> {
    logger.info({ msg: 'Unregistering all containers' });
    await Promise.all(Object.values(this.containersMap).map((wrapper) => wrapper.unregister()));
  }

  /**
   * Fetches detailed information for a single Docker container.
   * @param containerId The ID of the container to inspect.
   * @returns Container inspect response, or null on error (error is logged).
   */
  private async getContainerDetails(
    containerId: string,
  ): Promise<sdk.ContainerInspectResponse | null> {
    try {
      const containerDetails = await this.dockerApiClient.containerInspect({
        path: { id: containerId },
      });
      return containerDetails.data!;
    } catch (error) {
      logger.error({ msg: 'Failed to inspect container', containerId, error });
      return null;
    }
  }
}
