import { Router } from 'express';
import type { SessionStore } from '../../store/sessionStore.js';
import type { ModeChangePayload, SessionMode } from '../../types.js';

const VALID_MODES = new Set<SessionMode>(['silent', 'readonly', 'control']);

export function sessionRoutes(sessionStore: SessionStore): Router {
  const router = Router();

  router.get('/sessions', (_req, res) => {
    const sessions = sessionStore.listAll();
    res.json(sessions);
  });

  router.patch('/sessions/:conversationId/mode', (req, res) => {
    const { conversationId } = req.params;
    const { mode } = req.body as ModeChangePayload;

    if (!VALID_MODES.has(mode)) {
      res.status(400).json({ error: `Invalid mode: ${mode}` });
      return;
    }

    const session = sessionStore.getByConversationId(conversationId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    sessionStore.updateMode(conversationId, mode);
    res.json({ conversation_id: conversationId, mode });
  });

  return router;
}
