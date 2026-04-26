import { App, LogLevel } from '@slack/bolt';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

// Retry policy for Slack API calls. `clear` in a busy DM can hit tier 3
// (`chat.delete`) / tier 4 (`conversations.history`) rate limits, so we opt
// into an aggressive retry profile (up to ~12 retries, fast backoff).
// Inlined instead of importing `retryPolicies` from `@slack/web-api` because
// that package's named export isn't statically detectable from Node ESM.
const rapidRetryConfig = {
  retries: 12,
  factor: 1.96,
  minTimeout: 10,
  maxTimeout: 30_000,
  randomize: true,
};

export function createSlackApp(): App {
  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
    clientOptions: {
      retryConfig: rapidRetryConfig,
    },
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
