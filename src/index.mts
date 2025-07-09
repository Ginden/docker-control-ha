import 'dotenv/config';

import { createDockerApiClient } from './client.mjs';
import { HaDiscoverableManager } from '@ginden/ha-mqtt-discoverable';
import { mqttClient } from './mqtt.mjs';
import { ContainerWrapper } from './container-wrapper.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { DaemonWrapper } from './daemon.js';

const client = createDockerApiClient();

const manager = HaDiscoverableManager.withSettings({
  client: mqttClient,
});

const containersMap: Record<string, ContainerWrapper> = {};

async function getContainerDetails(containerId: string) {
  try {
    const containerDetails = await client.containerInspect({ path: { id: containerId } });
    return containerDetails.data!;
  } catch (error) {
    console.error(`Failed to inspect container ${containerId}:`, error);
    return null;
  }
}

let deamonWrapper: DaemonWrapper | null = null;

async function updateDaemonState() {
  const { data: systemInfo } = await client.systemInfo();
  if (!systemInfo) {
    logger.error({ msg: 'Failed to fetch system info' });
    return;
  }
  deamonWrapper ??= new DaemonWrapper(manager, client, systemInfo!);
  await deamonWrapper.update(systemInfo!);
  await deamonWrapper.updateUnhealthyContainersList(Object.values(containersMap));
}

async function reloadContainersMap() {
  logger.info({ msg: 'Reloading containers map' });
  const { data: containers = [] } = await client.containerList({
    query: { all: config.INCLUDE_DEAD_CONTAINERS },
  });
  const oldContainerIds = new Set(Object.keys(containersMap));
  const currentContainerIds = new Set(containers.map((c) => c.Id!).filter(Boolean));
  const removedContainerIds = [...oldContainerIds].filter((id) => !currentContainerIds.has(id));

  if (removedContainerIds.length > 0) {
    logger.info({ msg: `Removing deleted or stopped containers`, removedContainerIds });
    await Promise.all(removedContainerIds.map(async (id) => containersMap[id].unregister()));
  }

  await Promise.all(
    containers.map(async (container) => {
      if (!container.Id) {
        return; // Skip if no ID is present
      }
      const containerId = container.Id;
      const containerInfo = await getContainerDetails(containerId);
      if (!containerInfo) {
        return; // Skip if container details could not be fetched
      }

      containersMap[containerId] ??= new ContainerWrapper(manager, containerInfo, client);
      await containersMap[containerId].update(containerInfo);
    }),
  );
  if (config.EXPOSE_DAEMON_INFO) {
    await updateDaemonState();
  }
}

function unregisterAll() {
  logger.info({ msg: 'Unregistering all containers' });
  return Promise.all(Object.values(containersMap).map((wrapper) => wrapper.unregister()));
}

const unregisterAllAndExit = () => unregisterAll().then(() => process.exit());

process.on('SIGINT', unregisterAllAndExit);
process.on('SIGTERM', unregisterAllAndExit);

setInterval(() => reloadContainersMap().catch(console.error), config.POLLING_INTERVAL);

reloadContainersMap().catch(console.error);
