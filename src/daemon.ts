import {
  DeviceInfo,
  HaDiscoverableManager,
  Sensor,
  SensorInfo,
} from '@ginden/ha-mqtt-discoverable';
import { config } from './config.mjs';
import slug from 'slug';
import { sdk } from '@internal/docker-open-api';
import { ContainerWrapper } from './container-wrapper.mjs';

export const DAEMON_INFO_NAME = config.HA_DEVICE_ID_PREFIX + 'daemon_' + slug(config.DAEMON_CONTROLLER_NAME);

export class DaemonWrapper {
  private readonly deviceInfo: DeviceInfo;
  private unhealthyContainers?: Sensor;
  private sensors: Record<string, Sensor> = {}
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
}
