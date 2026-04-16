import { createSlackApp } from './slack/app.js';
import { registerMessageHandler } from './slack/handlers/message.js';
import { registerActionHandlers } from './slack/handlers/actions.js';
import { createHttpServer } from './server/http.js';
import { SessionStore } from './store/sessionStore.js';
import { PendingReplyStore } from './store/pendingReplyStore.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

async function main() {
  const sessionStore = new SessionStore(config.dbPath);
  const pendingReplyStore = new PendingReplyStore();
  const pendingAnswerStore = new PendingReplyStore();
  const slackApp = createSlackApp();

  registerMessageHandler(slackApp, sessionStore, pendingReplyStore);
  registerActionHandlers(slackApp, sessionStore, pendingAnswerStore);

  const httpServer = createHttpServer(slackApp, sessionStore, pendingReplyStore, pendingAnswerStore);

  await slackApp.start();
  logger.info('Slack bot connected via Socket Mode');

  function shutdown(signal: string) {
    logger.info({ signal }, 'Shutting down');
    pendingReplyStore.resolveAll();
    pendingAnswerStore.resolveAll();
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });
    sessionStore.close();
    slackApp.stop().then(() => {
      logger.info('Slack app stopped');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
