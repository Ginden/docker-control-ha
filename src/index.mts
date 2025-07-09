import 'dotenv/config';

import { createDockerApiClient } from './docker-api-client.mjs';
import { HaDiscoverableManager } from '@ginden/ha-mqtt-discoverable';
import { mqttClient } from './mqtt.mjs';
import { config } from './config/config.mjs';
import { logger } from './logger.mjs';
import { DaemonWrapper } from './ha/daemon.mjs';
import { ContainerManager } from './container-manager.mjs';

// Initialize Docker API client for communication with the Docker daemon.
const client = createDockerApiClient();

// Initialize Home Assistant Discoverable Manager for MQTT discovery.
// Log levels are downgraded to align with application's logging strategy.
const haManager = HaDiscoverableManager.withSettings({
  client: mqttClient,
  logger: {
    debug: logger.trace.bind(logger),
    info: logger.debug.bind(logger),
    warn: logger.info.bind(logger),
    error: logger.warn.bind(logger),
  }
});

// Initialize ContainerManager to handle Docker container entities in Home Assistant.
const containerManager = new ContainerManager(haManager, client);

// DaemonWrapper instance, initialized only if daemon info exposure is enabled.
let daemonWrapper: DaemonWrapper | null = null;

/**
 * Updates the Docker daemon's state in Home Assistant.
 * Fetches system info and updates the DaemonWrapper, including unhealthy container list.
 * This ensures Home Assistant reflects the overall health and status of the Docker daemon.
 */
async function updateDaemonState() {
  if (!config.EXPOSE_DAEMON_INFO) {
    return;
  }
  const { data: systemInfo } = await client.systemInfo();
  if (!systemInfo) {
    logger.error({ msg: 'Failed to fetch system info' });
    return;
  }
  // Initialize DaemonWrapper if it doesn't exist, passing the reconcileState function for refresh capability.
  daemonWrapper ??= new DaemonWrapper(haManager, systemInfo!, reconcileState);
  await daemonWrapper.update(systemInfo!);
  // Update the list of unhealthy containers, crucial for daemon health monitoring.
  await daemonWrapper.updateUnhealthyContainersList(containerManager.getUnhealthyContainers());
}

/**
 * Main reconciliation loop. Triggers container state refresh and daemon state update.
 * This function is called periodically to keep Home Assistant synchronized with Docker.
 */
async function reconcileState() {
  await containerManager.refreshState();
  await updateDaemonState();
}

/**
 * Unregisters all Home Assistant entities managed by the application.
 * Called during graceful shutdown to clean up entities in Home Assistant.
 */
async function unregisterAll() {
  logger.info({ msg: 'Unregistering all entities' });
  // Unregister both container and daemon entities concurrently.
  return Promise.all([containerManager.unregisterAll(), daemonWrapper ? daemonWrapper.unregister() : Promise.resolve()]);
}

// Graceful shutdown handling for SIGINT and SIGTERM signals.
const unregisterAllAndExit = () => unregisterAll().then(() => process.exit());

process.on('SIGINT', unregisterAllAndExit);
process.on('SIGTERM', unregisterAllAndExit);

// Start the periodic reconciliation loop.
setInterval(() => reconcileState().catch(err => logger.warn({msg: `Failed to reload state`, err})), config.POLLING_INTERVAL);

// Initial reconciliation call on application startup.
reconcileState().catch(err => {
  logger.error({ msg: 'Failed to reload state on startup', err });
});
