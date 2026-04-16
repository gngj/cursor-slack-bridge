import express from 'express';
import type { App } from '@slack/bolt';
import type { Server } from 'node:http';
import { healthRoutes } from './routes/healthRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { hookRoutes } from './routes/hookRoutes.js';
import type { SessionStore } from '../store/sessionStore.js';
import type { PendingReplyStore } from '../store/pendingReplyStore.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export function createHttpServer(
  slackApp: App,
  sessionStore: SessionStore,
  pendingReplyStore: PendingReplyStore,
  pendingAnswerStore: PendingReplyStore,
): Server {
  const app = express();
  app.use(express.json());
  app.use(healthRoutes());
  app.use(sessionRoutes(sessionStore));
  app.use(hookRoutes(slackApp, sessionStore, pendingReplyStore, pendingAnswerStore));

  const server = app.listen(config.port, '127.0.0.1', () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  return server;
}
