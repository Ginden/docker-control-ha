import { z } from 'zod/v4';
import { hostname } from 'node:os';
import { MqttProtocol } from 'mqtt';

export const envSchema = z.object({
  // Hostname of MQTT broker
  MQTT_HOST: z.string().default('localhost'),
  // Port of MQTT broker
  MQTT_PORT: z.coerce
    .number()
    .int()
    .max(2 ** 16 - 1)
    .min(1) // Port 0 is for servers, not clients
    .default(1883),
  // MQTT credentials, optional
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  // MQTT protocol to use - defaults to unsecured MQTT
  MQTT_PROTOCOL: z
    .enum(['mqtt', 'mqtts', 'ws', 'wss', 'alis'] as const satisfies MqttProtocol[])
    .default('mqtt'),
  // MQTT client ID, defaults to ha-docker-api-{hostname}
  MQTT_CLIENT_ID: z.string().default(`ha-docker-api-${hostname()}`),
  // Custom path to the configuration file, if not set, intelligent defaults will be used
  DOCKER_SOCKET_PATH: z.string().optional(),
  // Enable control of Docker containers
  ENABLE_CONTROL: z.coerce.boolean().default(false),
  INCLUDE_DEAD_CONTAINERS: z.coerce.boolean().default(false),
  HA_DEVICE_ID_PREFIX: z.string().default('docker_'),
  UPTIME_MEASURE_TYPE: z.enum(['seconds', 'human']).default('human'),
  // Time in milliseconds to poll Docker API for changes
  POLLING_INTERVAL: z.coerce.number().int().min(1000).default(30_000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  EXPOSE_DAEMON_INFO: z.coerce.boolean().default(false),
  DAEMON_CONTROLLER_NAME: z.string().default(`Docker Daemon on ${hostname()}`),
});

export type Config = z.infer<typeof envSchema>;
