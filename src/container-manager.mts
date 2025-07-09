import { HaDiscoverableManager } from '@ginden/ha-mqtt-discoverable';
import { sdk } from '@internal/docker-open-api';
import { config } from './config/config.mjs';
import { DockerApiClient } from './docker-api-client.mjs';
import { ContainerWrapper } from './ha/container.mjs';
import { logger } from './logger.mjs';
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
    // Fetch all containers, including dead ones if configured, for a complete comparison.
    const { data: containers = [], status } = await this.dockerApiClient.containerList({
      query: { all: config.INCLUDE_DEAD_CONTAINERS },
    });

    assert(status === 200, `Failed to fetch containers: ${status}`);

    logger.debug({ msg: `Found ${containers.length} containers` });

    // Use sets for efficient identification of added, removed, and existing containers.
    const oldContainerIds = new Set(Object.keys(this.containersMap));
    const currentContainerIds = new Set(containers.map((c) => c.Id!).filter(Boolean));
    const removedContainerIds = [...oldContainerIds].filter((id) => !currentContainerIds.has(id));

    // Unregister stale entities from Home Assistant.
    if (removedContainerIds.length > 0) {
      logger.info({ msg: `Removing deleted or stopped containers`, removedContainerIds });
      await Promise.all(removedContainerIds.map(async (id) => this.containersMap[id].unregister()));
    }

    // Process each current container: add new ones, update existing ones.
    await Promise.all(
      containers.map(async (container) => {
        if (!container.Id) {
          logger.debug({ msg: 'Skipping container with no ID', container });
          return;
        }
        const containerId = container.Id;
        // Fetch detailed info for HA entity creation/updates.
        const containerInfo = await this.getContainerDetails(containerId);
        if (!containerInfo) {
          logger.debug({
            msg: `Skipping container ${containerId} due to missing details`,
            container: { id: containerId, name: container.Names },
          });
          return;
        }

        // Skip containers without the required label if configured, for selective exposure.
        if (
          config.REQUIRE_LABEL_TO_EXPOSE &&
          !containerInfo.Config?.Labels?.[config.REQUIRE_LABEL_TO_EXPOSE]
        ) {
          logger.debug({
            msg: `Skipping container ${containerId} due to missing required label`,
            containerInfo,
          });
          return;
        }

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
      logger.error(`Failed to inspect container`, { containerId, error });
      return null;
    }
  }
}
