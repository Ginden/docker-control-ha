import {
  Button,
  ButtonInfo,
  DeviceInfo,
  HaDiscoverableManager,
  Sensor,
  SensorInfo,
} from '@ginden/ha-mqtt-discoverable';
import { config } from '../config/config.mjs';
import slug from 'slug';
import { sdk } from '@internal/docker-open-api';
import { ContainerWrapper } from './container.mjs';
import { DockerApiClient } from '../docker-api-client.mjs';

export const DAEMON_INFO_NAME =
  config.HA_DEVICE_ID_PREFIX + 'daemon_' + slug(config.DAEMON_CONTROLLER_NAME);

/**
 * Manages the Docker daemon as a Home Assistant device.
 * Exposes daemon-level sensors (e.g., container counts) and control buttons (e.g., refresh).
 */
export class DaemonWrapper {
  private readonly deviceInfo: DeviceInfo;
  private unhealthyContainers?: Sensor;
  private sensors: Record<string, Sensor> = {};
  private buttons: Record<string, Button> = {};
  private readonly identifier = DAEMON_INFO_NAME;

  /**
   * @param ha The Home Assistant Discoverable Manager instance.
   * @param info Initial Docker system info.
   * @param reconcileState A callback to trigger a full state reconciliation in the main application loop.
   */
  constructor(
    private readonly ha: HaDiscoverableManager,
    info: sdk.SystemInfoResponse,
    private readonly reconcileState: () => Promise<void>,
  ) {
    this.deviceInfo = DeviceInfo.create({
      name: config.DAEMON_CONTROLLER_NAME,
      identifiers: [DAEMON_INFO_NAME],
      swVersion: info.ServerVersion,
    });
  }

  /**
   * Updates the daemon's Home Assistant entities with the latest system information.
   * @param info The latest Docker system info.
   */
  async update(info: sdk.SystemInfoResponse) {
    await this.updateContainerCounts(info);
    await this.registerCommands();
  }

  /**
   * Unregisters all Home Assistant entities associated with the daemon.
   * Called during application shutdown to clean up HA entities.
   */
  async unregister() {
    await Promise.all([
        ...Object.values(this.sensors).map((sensor) => sensor.unregister()),
        ...Object.values(this.buttons).map((button) => button.unregister()),]);
  }

  /**
   * Updates the Home Assistant sensor for unhealthy containers.
   * @param containers An iterable of ContainerWrapper instances to check for unhealthy status.
   */
  async updateUnhealthyContainersList(containers: Iterable<ContainerWrapper>) {
    const unhealthyContainers = Array.from(containers).filter((container) => container.unhealthy);

    this.unhealthyContainers ??= new Sensor(
      this.ha,
      SensorInfo.create({
        name: 'Unhealthy Containers',
        device: this.deviceInfo,
        uniqueId: `${this.identifier}_unhealthy_containers`,
      }),
    );

    await Promise.all([
      this.unhealthyContainers.updateState(unhealthyContainers.length),
      this.unhealthyContainers.setAttributes({
        list: unhealthyContainers.map((c) => c.name),
      }),
    ]);
  }

  /**
   * Updates Home Assistant sensors for Docker container counts (running, paused, stopped).
   * @param info The Docker system info containing container count data.
   */
  private async updateContainerCounts(info: sdk.SystemInfoResponse) {
    this.sensors['running_containers'] ??= new Sensor(
      this.ha,
      SensorInfo.create({
        name: 'Running Containers',
        device: this.deviceInfo,
        uniqueId: `${this.identifier}_running_containers`,
      }),
    );
    await this.sensors['running_containers'].updateState(info.ContainersRunning ?? 0);
    this.sensors['paused_containers'] ??= new Sensor(
      this.ha,
      SensorInfo.create({
        name: 'Paused Containers',
        device: this.deviceInfo,
        uniqueId: `${this.identifier}_paused_containers`,
      }),
    );
    await this.sensors['paused_containers'].updateState(info.ContainersPaused ?? 0);
    this.sensors['stopped_containers'] ??= new Sensor(
      this.ha,
      SensorInfo.create({
        name: 'Stopped Containers',
        device: this.deviceInfo,
        uniqueId: `${this.identifier}_stopped_containers`,
      }),
    );
    await this.sensors['stopped_containers'].updateState(info.ContainersStopped ?? 0);
  }

  /**
   * Registers control buttons for the daemon (e.g., refresh state).
   * These buttons allow users to trigger daemon-level actions from Home Assistant.
   */
  private async registerCommands() {
    if (!config.ENABLE_CONTROL) {
      return;
    }
    this.buttons['refresh'] ??= new Button(
      ButtonInfo.create({
        name: 'Refresh state',
        device: this.deviceInfo,
        uniqueId: `${this.identifier}_reload`,
        deviceClass: 'update',
        expireAfter: config.POLLING_INTERVAL * 5,
      }),
      this.ha,
    ).on('command.json', () => {
      // Trigger a full state reconciliation in the main application loop.
      this.reconcileState();
    });
  }
}
