import {
  Button,
  ButtonInfo,
  DeviceInfo,
  HaDiscoverableManager,
  Sensor,
  SensorInfo,
} from '@ginden/ha-mqtt-discoverable';
import { config } from './config.mjs';
import slug from 'slug';
import { sdk } from '@internal/docker-open-api';
import { ContainerWrapper } from './container-wrapper.mjs';
import { DockerApiClient } from './client.mjs';

export const DAEMON_INFO_NAME =
  config.HA_DEVICE_ID_PREFIX + 'daemon_' + slug(config.DAEMON_CONTROLLER_NAME);

export class DaemonWrapper {
  private readonly deviceInfo: DeviceInfo;
  private unhealthyContainers?: Sensor;
  private sensors: Record<string, Sensor> = {};
  private buttons: Record<string, Button> = {};
  private readonly identifier = DAEMON_INFO_NAME;

  constructor(
    private readonly ha: HaDiscoverableManager,
    info: sdk.SystemInfoResponse,
  ) {
    this.deviceInfo = DeviceInfo.create({
      name: config.DAEMON_CONTROLLER_NAME,
      identifiers: [DAEMON_INFO_NAME],
      swVersion: info.ServerVersion,
    });
  }

  async update(info: sdk.SystemInfoResponse) {
    await this.updateContainerCounts(info);
    await this.registerCommands();
  }

  async unregister() {
    await Promise.all([
        ...Object.values(this.sensors).map((sensor) => sensor.unregister()),
        ...Object.values(this.buttons).map((button) => button.unregister()),]);
  }

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
      // TODO: trigger refresh of all containers
    });
  }
}
