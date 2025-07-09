import { connect } from 'mqtt';
import { config } from './config/config.mjs';

const server = config.MQTT_HOST;
const port = config.MQTT_PORT;
const username = config.MQTT_USERNAME;
const password = config.MQTT_PASSWORD;
// Determine MQTT protocol based on configuration or default to mqtts for port 8883.
const protocol = config.MQTT_PROTOCOL ? config.MQTT_PROTOCOL : port === 8883 ? 'mqtts' : 'mqtt';
const clientId = config.MQTT_CLIENT_ID;

const mqttUrl = `${protocol}://${server}:${port}`;

/**
 * Establishes and exports the MQTT client connection.
 * This client is used for all MQTT communication, including Home Assistant MQTT Discovery.
 * Connection parameters are sourced from the application configuration.
 */
export const mqttClient = connect(mqttUrl, {
  ...(username && { username }),
  ...(password && { password }),
  clientId,
  connectTimeout: 10_000,
  keepalive: 10,
  protocol,
});
