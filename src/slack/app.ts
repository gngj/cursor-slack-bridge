import { App, LogLevel } from '@slack/bolt';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export function createSlackApp(): App {
  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
    logger: {
      debug: (...msgs) => logger.debug(msgs.join(' ')),
      info: (...msgs) => logger.info(msgs.join(' ')),
      warn: (...msgs) => logger.warn(msgs.join(' ')),
      error: (...msgs) => logger.error(msgs.join(' ')),
      getLevel: () => config.logLevel as LogLevel,
      setLevel: () => {},
      setName: () => {},
    },
  });

  return app;
}
