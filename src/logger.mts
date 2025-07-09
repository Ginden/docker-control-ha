import { pino } from 'pino';
import { config } from './config/config.mjs';

/**
 * Initializes the Pino logger for structured and efficient logging.
 * The log level is dynamically set from the application configuration,
 * allowing for flexible control over verbosity during runtime.
 */
export const logger = pino({
  name: `docker-control-ha`,
  level: config.LOG_LEVEL,
});
