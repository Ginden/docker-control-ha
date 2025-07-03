import { pino } from 'pino';
import { config } from './config.mjs';

export const logger = pino({
  name: `docker-control-ha`,
  level: config.LOG_LEVEL,
});
