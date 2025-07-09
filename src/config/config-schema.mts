import { z } from 'zod/v4';
import { hostname } from 'node:os';
import { MqttProtocol } from 'mqtt';

export const envSchema = z.object({
  // MQTT_HOST: Hostname of the MQTT broker. Essential for Home Assistant communication.
  MQTT_HOST: z.string().default('localhost'),
  // MQTT_PORT: Port of the MQTT broker. Ensures correct communication.
  MQTT_PORT: z.coerce
    .number()
    .int()
    .max(2 ** 16 - 1)
    .min(1) // Port 0 is reserved
    .default(1883),
  // MQTT_USERNAME: Optional username for MQTT broker authentication.
  MQTT_USERNAME: z.string().optional(),
  // MQTT_PASSWORD: Optional password for MQTT broker authentication.
  MQTT_PASSWORD: z.string().optional(),
  // MQTT_PROTOCOL: Protocol to use (e.g., mqtt, mqtts, ws, wss). Defaults to unsecured MQTT.
  MQTT_PROTOCOL: z
    .enum(['mqtt', 'mqtts', 'ws', 'wss', 'alis'] as const satisfies MqttProtocol[])
      .optional()
      .nullish()
    .default(null),
  // MQTT_CLIENT_ID: Client ID for MQTT. Defaults to a unique ID to prevent conflicts.
  MQTT_CLIENT_ID: z.string().default(`ha-docker-api-${hostname()}`),
  // DOCKER_SOCKET_PATH: Path to the Docker socket. How the app communicates with Docker.
  DOCKER_SOCKET_PATH: z.string().optional(),
  // ENABLE_CONTROL: Enables/disables container control actions from Home Assistant for safety.
  ENABLE_CONTROL: z.coerce.boolean().default(false),
  // INCLUDE_DEAD_CONTAINERS: If true, includes stopped/exited containers in discovery for full monitoring.
  INCLUDE_DEAD_CONTAINERS: z.coerce.boolean().default(false),
  // HA_DEVICE_ID_PREFIX: Prefix for all Home Assistant device IDs, for better organization.
  HA_DEVICE_ID_PREFIX: z.string().default(`docker_${hostname()}_`),
  // UPTIME_MEASURE_TYPE: How container uptime is displayed (e.g., "human" or "seconds").
  UPTIME_MEASURE_TYPE: z.enum(['seconds', 'human']).default('human'),
  // POLLING_INTERVAL: Interval (ms) to poll Docker API. Shorter interval = more real-time, higher resource usage.
  POLLING_INTERVAL: z.coerce.number().int().min(1000).default(30_000),

  // LOG_LEVEL: Logging level for application output.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // EXPOSE_DAEMON_INFO: If true, exposes Docker daemon info as a Home Assistant device.
  EXPOSE_DAEMON_INFO: z.coerce.boolean().default(false),
  // REQUIRE_LABEL_TO_EXPOSE: If set, only containers with this label are exposed, allowing selective exposure.
  REQUIRE_LABEL_TO_EXPOSE: z.string().nullish().default(null),
  // DAEMON_CONTROLLER_NAME: Name of the Docker daemon device in Home Assistant.
  DAEMON_CONTROLLER_NAME: z.string().default(`Docker Daemon on ${hostname()}`),
});

export type Config = z.infer<typeof envSchema>;
