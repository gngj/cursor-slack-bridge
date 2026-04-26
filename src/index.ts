import { createSlackApp } from './slack/app.js';
import { registerMessageHandler } from './slack/handlers/message.js';
import { registerActionHandlers } from './slack/handlers/actions.js';
import { createHttpServer } from './server/http.js';
import { SessionStore } from './store/sessionStore.js';
import { PendingReplyStore } from './store/pendingReplyStore.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { closeCursorDb } from './lib/cursorDb.js';

async function main() {
  const sessionStore = new SessionStore(config.dbPath);
  const pendingReplyStore = new PendingReplyStore();
  const pendingAnswerStore = new PendingReplyStore();
  const slackApp = createSlackApp();

  registerMessageHandler(slackApp, sessionStore, pendingReplyStore, pendingAnswerStore);
  registerActionHandlers(slackApp, sessionStore, pendingAnswerStore);

  const httpServer = createHttpServer(slackApp, sessionStore, pendingReplyStore, pendingAnswerStore);

  await slackApp.start();
  logger.info('Slack bot connected via Socket Mode');

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    // 1. Resolve in-flight long-polls first so their HTTP handlers can
    //    `res.json(...)` on a still-open Express connection.
    pendingReplyStore.resolveAll();
    pendingAnswerStore.resolveAll();

    // 2. Stop accepting new HTTP connections and wait for in-flight requests
    //    to finish writing their responses.
    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) logger.warn({ err }, 'HTTP server close reported error');
        resolve();
      });
    });
    logger.info('HTTP server closed');

    // 3. Close Slack socket last — any response handlers from step 1 have
    //    already flushed, and no new events should be delivered.
    try {
      await slackApp.stop();
      logger.info('Slack app stopped');
    } catch (err) {
      logger.warn({ err }, 'Slack app stop reported error');
    }

    sessionStore.close();
    closeCursorDb();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
