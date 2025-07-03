import { connect, MqttProtocol } from 'mqtt';
import { hostname } from 'node:os';
import { config } from './config.mjs';

const server = config.MQTT_HOST;
const port = config.MQTT_PORT;
const username = config.MQTT_USERNAME;
const password = config.MQTT_PASSWORD;
const protocol = config.MQTT_PROTOCOL as MqttProtocol;
const clientId = config.MQTT_CLIENT_ID;

const mqttUrl = `${protocol}://${server}:${port}`;

export const mqttClient = connect(mqttUrl, {
  ...(username && { username }),
  ...(password && { password }),
  clientId,
  connectTimeout: 10_000,
  keepalive: 10,
  protocol,
});
