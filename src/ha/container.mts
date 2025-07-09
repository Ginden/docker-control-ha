import {
  BinarySensor,
  BinarySensorInfo,
  Button,
  ButtonInfo,
  DeviceInfo,
  HaDiscoverableManager,
  Sensor,
  SensorInfo,
} from '@ginden/ha-mqtt-discoverable';
import { sdk } from '@internal/docker-open-api';
import { config } from '../config/config.mjs';
import { DockerApiClient } from '../docker-api-client.mjs';
import { assert } from 'tsafe';
import { formatUptime } from '../utils/format-uptime.mjs';
import { calculateDeviceId } from '../utils/calculate-device-id.mjs';
import { logger } from '../logger.mjs';
import { DAEMON_INFO_NAME } from './daemon.mjs';
import { extractManufacturer, extractModel, extractSwVersion } from '../utils/extract-info.mjs';

/**
 * Wraps a Docker container to expose it as a Home Assistant entity.
 * Manages the creation and updating of various sensors and controls for the container.
 */
export class ContainerWrapper {
  public readonly deviceInfo: DeviceInfo;
  public unhealthy: boolean = false;

  get name() {
    return this.deviceInfo.name;
  }
  private health?: Sensor;
  private uptime?: Sensor;
  private imageBase?: Sensor;
  private running?: BinarySensor;
  private commands: Record<string, Button> = {};
  private readonly viaDevice = config.EXPOSE_DAEMON_INFO ? DAEMON_INFO_NAME : undefined;

  /**
   * @param ha The Home Assistant Discoverable Manager instance.
   * @param data Initial Docker container inspect data.
   * @param dockerApiClient The Docker API client.
   */
  public constructor(
    private readonly ha: HaDiscoverableManager,
    data: sdk.ContainerInspectResponse,
    private readonly dockerApiClient: DockerApiClient,
  ) {
    const deviceId = calculateDeviceId(data);
    const containerName = data.Name?.replace(/^\//, '') || data.Id;
    assert(containerName, 'Container must have a name or ID');
    const model = extractModel(data) ?? 'Docker Container';

    const manufacturer = extractManufacturer(data) ?? 'Docker';
    const swVersion = extractSwVersion(data) ?? 'unknown';

    this.deviceInfo = DeviceInfo.create({
      name: `Container ${containerName}`,
      model,
      identifiers: [deviceId],
      manufacturer,
      swVersion,
      viaDevice: this.viaDevice,
    });
  }

  /**
   * Updates the Home Assistant entities for the container based on new Docker inspect data.
   * This method is called periodically to keep HA in sync with the container's state.
   * @param data The latest Docker container inspect data.
   */
  public async update(data: sdk.ContainerInspectResponse): Promise<void> {
    logger.debug({ msg: `Updating container`, containerId: data.Id, containerName: data.Name });
    await this.constructSubEntities(data);
    await this.exposeCommands(data);
  }

  /**
   * Unregisters all Home Assistant entities associated with this container.
   * Called when a container is removed or the application is shutting down.
   */
  public async unregister(): Promise<void> {
    logger.info({ msg: `Unregistering container`, container: this.deviceInfo.identifiers![0] });
    const subEntities = [
      this.running,
      this.uptime,
      this.health,
      this.imageBase,
      ...Object.values(this.commands),
    ];
    await Promise.all(
      subEntities.map(async (entity) => {
        if (!entity) {
          return;
        }
        return entity.unregister();
      }),
    );
  }

  /**
   * Constructs or updates the core Home Assistant sensors for the container (running, uptime, health, image).
   * @param data The Docker container inspect data.
   */
  private async constructSubEntities(data: sdk.ContainerInspectResponse) {
    this.unhealthy = data.State?.Health?.Status === 'unhealthy' || !data.State?.Running;
    await this.setRunning(data);
    await this.setUptime(data);
    await this.setHealth(data);
    await this.setImageBase(data);
  }

  private async setRunning(data: sdk.ContainerInspectResponse) {
    this.running ??= new BinarySensor(
      BinarySensorInfo.create({
        name: 'Running',
        device: this.deviceInfo,
        deviceClass: 'running',
        expireAfter: config.POLLING_INTERVAL * 5,
        uniqueId: `${this.deviceInfo.identifiers![0]}_running`,
      }),
      this.ha,
    );
    await this.running.updateState(data.State?.Running ?? false);
  }

  private async setUptime(data: sdk.ContainerInspectResponse) {
    if (config.UPTIME_MEASURE_TYPE === 'seconds') {
      this.uptime ??= new Sensor(
        this.ha,
        SensorInfo.create({
          name: 'Uptime (seconds)',
          device: this.deviceInfo,
          uniqueId: `${this.deviceInfo.identifiers![0]}_uptime_seconds`,
          expireAfter: config.POLLING_INTERVAL * 5,
          deviceClass: 'duration',
          unitOfMeasurement: 's',
        }),
      );
      if (data.State?.StartedAt) {
        const startedAt = new Date(data.State.StartedAt).getTime();
        const now = Date.now();
        const uptimeSeconds = Math.floor((now - startedAt) / 1000);
        await this.uptime.updateState(uptimeSeconds);
      } else {
        await this.uptime.updateState('None');
      }
    } else if (config.UPTIME_MEASURE_TYPE === 'human') {
      this.uptime ??= new Sensor(
        this.ha,
        SensorInfo.create({
          name: 'Uptime',
          device: this.deviceInfo,
          uniqueId: `${this.deviceInfo.identifiers![0]}_uptime_human`,
          expireAfter: config.POLLING_INTERVAL * 5,
        }),
      );
      if (data.State?.StartedAt) {
        const uptime = formatUptime(data.State.StartedAt);
        await this.uptime.updateState(uptime);
      } else {
        await this.uptime.updateState('None');
      }
    }
  }

  private async setHealth(data: sdk.ContainerInspectResponse) {
    this.health ??= new Sensor(
      this.ha,
      SensorInfo.create({
        name: 'Health',
        device: this.deviceInfo,
        uniqueId: `${this.deviceInfo.identifiers![0]}_health`,
        expireAfter: config.POLLING_INTERVAL * 5,
      }),
    );

    if (data.State?.Health?.Status) {
      await this.health.updateState(data.State.Health.Status);
    } else {
      await this.health.updateState('None');
    }
  }

  private async setImageBase(data: sdk.ContainerInspectResponse) {
    this.imageBase ??= new Sensor(
      this.ha,
      SensorInfo.create({
        name: 'Image',
        device: this.deviceInfo,
        uniqueId: `${this.deviceInfo.identifiers![0]}_image_base`,
        expireAfter: 600, // 10 minutes
      }),
    );

    if (data.Config?.Image) {
      const imageBase = data.Config.Image;
      await this.imageBase.updateState(imageBase);
    } else {
      await this.imageBase.updateState('None');
    }
  }

  /**
   * Exposes control buttons (restart, pause, kill, stop, start) for the container to Home Assistant.
   * These buttons allow users to perform actions on the Docker container directly from HA.
   * @param data The Docker container inspect data.
   */
  private async exposeCommands(data: sdk.ContainerInspectResponse) {
    if (!config.ENABLE_CONTROL) {
      return;
    }
    assert(data.Id);
    const containerId = data.Id;
    this.commands['restart'] ??= new Button(
      ButtonInfo.create({
        name: 'Restart',
        device: this.deviceInfo,
        uniqueId: `${this.deviceInfo.identifiers![0]}_restart`,
        deviceClass: 'restart',
        expireAfter: config.POLLING_INTERVAL * 5,
      }),
      this.ha,
    ).on('command.json', () => {
      logger.info({ msg: `Restarting container`, containerId });
      this.dockerApiClient.containerRestart({ path: { id: containerId } }).catch((error) => {
        logger.warn({ msg: `Failed to restart container`, error, containerId });
      });
    });

    this.commands['pause'] ??= new Button(
      ButtonInfo.create({
        name: 'Pause',
        device: this.deviceInfo,
        uniqueId: `${this.deviceInfo.identifiers![0]}_pause`,
        icon: 'mdi:pause',
        expireAfter: config.POLLING_INTERVAL * 5,
      }),
      this.ha,
    ).on('command.json', () => {
      logger.info({ msg: `Pausing container`, containerId });
      this.dockerApiClient.containerPause({ path: { id: containerId } }).catch((error) => {
        logger.warn({ msg: `Failed to pause container`, error, containerId });
      });
    });

    this.commands['kill'] ??= new Button(
      ButtonInfo.create({
        name: 'Kill',
        icon: 'mdi:skull',
        device: this.deviceInfo,
        uniqueId: `${this.deviceInfo.identifiers![0]}_kill`,
        expireAfter: config.POLLING_INTERVAL * 5,
      }),
      this.ha,
    ).on('command.json', () => {
      logger.info({ msg: `Killing container`, containerId });
      this.dockerApiClient.containerKill({ path: { id: containerId } }).catch((err) => {
        logger.warn({ msg: `Failed to kill container`, err, containerId });
      });
    });

    this.commands['stop'] ??= new Button(
      ButtonInfo.create({
        name: 'Stop',
        icon: 'mdi:publish-off',
        device: this.deviceInfo,
        uniqueId: `${this.deviceInfo.identifiers![0]}_stop`,
        expireAfter: config.POLLING_INTERVAL * 5,
      }),
      this.ha,
    ).on('command.json', () => {
      logger.info({ msg: `Stopping container`, containerId });
      this.dockerApiClient.containerStop({ path: { id: containerId } }).catch((error) => {
        logger.warn({ msg: `Failed to stop container`, error, containerId });
      });
    });

    if (config.INCLUDE_DEAD_CONTAINERS) {
      this.commands['start'] ??= new Button(
        ButtonInfo.create({
          name: 'Start',
          icon: 'mdi:play',
          device: this.deviceInfo,
          uniqueId: `${this.deviceInfo.identifiers![0]}_start`,
          expireAfter: config.POLLING_INTERVAL * 5,
        }),
        this.ha,
      ).on('command.json', () => {
        logger.info({ msg: `Starting container`, containerId });
        this.dockerApiClient.containerStart({ path: { id: containerId } }).catch((error) => {
          logger.warn({ msg: `Failed to start container`, error, containerId });
        });
      });
    }
  }
}
