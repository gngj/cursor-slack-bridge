import { Router } from 'express';
import type { App } from '@slack/bolt';
import type { SessionStore } from '../../store/sessionStore.js';
import type { PendingReplyStore } from '../../store/pendingReplyStore.js';
import type {
  AgentResponsePayload,
  AgentThoughtPayload,
  SessionStartPayload,
  StopPayload,
  ToolUsePayload,
} from '../../types.js';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';
import {
  sessionMessageBlocks,
  sessionMessageText,
  agentResponseBlocks,
  agentThoughtBlocks,
  askQuestionBlocks,
  toolUseBlocks,
  stopPromptBlocks,
} from '../../slack/blocks.js';

const ASK_QUESTION_TIMEOUT_MS = 120_000;

type ToolHandler = 'ask_question' | 'notify';

const SPECIAL_TOOLS: Record<string, ToolHandler> = {
  AskQuestion: 'ask_question',
};

function getToolHandler(toolName: string): ToolHandler {
  return SPECIAL_TOOLS[toolName] ?? 'notify';
}

export function hookRoutes(
  slackApp: App,
  sessionStore: SessionStore,
  pendingReplyStore: PendingReplyStore,
  pendingAnswerStore: PendingReplyStore,
): Router {
  const router = Router();

  router.post('/hook/session-start', async (req, res) => {
    const { conversation_id, repo_name, branch_name, workspace_path } =
      req.body as SessionStartPayload;
    if (!conversation_id) {
      res.status(400).json({ error: 'Missing conversation_id' });
      return;
    }

    const existing = sessionStore.getByConversationId(conversation_id);
    if (existing) {
      res.json({ thread_ts: existing.thread_ts, channel_id: existing.channel_id });
      return;
    }

    try {
      const dmOpen = await slackApp.client.conversations.open({
        users: config.slack.userId,
      });
      const dmChannelId = dmOpen.channel?.id;
      if (!dmChannelId) {
        throw new Error('Failed to open DM channel');
      }

      const ctx = {
        conversationId: conversation_id,
        repoName: repo_name,
        branchName: branch_name,
        workspacePath: workspace_path,
      };

      const result = await slackApp.client.chat.postMessage({
        channel: dmChannelId,
        text: sessionMessageText(ctx, 'silent'),
        blocks: sessionMessageBlocks(ctx, 'silent'),
      });

      if (!result.ts || !result.channel) {
        throw new Error('Slack postMessage returned no ts or channel');
      }

      const now = new Date().toISOString();
      const session = {
        conversation_id,
        thread_ts: result.ts,
        channel_id: result.channel,
        mode: 'silent' as const,
        status: 'active' as const,
        repo_name: repo_name ?? null,
        branch_name: branch_name ?? null,
        workspace_path: workspace_path ?? null,
        created_at: now,
        last_message_at: now,
      };
      sessionStore.create(session);

      logger.info({ conversationId: conversation_id, threadTs: result.ts }, 'Session created');
      res.json({ thread_ts: result.ts, channel_id: result.channel });
    } catch (err) {
      logger.error({ err, conversationId: conversation_id }, 'Failed to create session');
      res.status(500).json({ error: 'Failed to create Slack thread' });
    }
  });

  router.post('/hook/agent-response', async (req, res) => {
    const { conversation_id, text } = req.body as AgentResponsePayload;
    const trimmedText = text?.trim();
    if (!conversation_id || !trimmedText) {
      res.json({});
      return;
    }

    const session = sessionStore.getByConversationId(conversation_id);
    if (!session) {
      res.json({});
      return;
    }

    if (session.mode === 'silent') {
      res.json({});
      return;
    }

    try {
      await slackApp.client.chat.postMessage({
        channel: session.channel_id,
        thread_ts: session.thread_ts,
        text: trimmedText,
        blocks: agentResponseBlocks(trimmedText),
      });
      sessionStore.touchLastMessage(conversation_id);
      res.json({ posted: true });
    } catch (err) {
      logger.error({ err, conversationId: conversation_id }, 'Failed to post agent response');
      res.status(500).json({ error: 'Failed to post to Slack' });
    }
  });

  router.post('/hook/agent-thought', async (req, res) => {
    const { conversation_id, text, duration_ms } = req.body as AgentThoughtPayload;
    const trimmedText = text?.trim();
    if (!conversation_id || !trimmedText) {
      res.json({});
      return;
    }

    const session = sessionStore.getByConversationId(conversation_id);
    if (!session || session.mode === 'silent') {
      res.json({});
      return;
    }

    try {
      await slackApp.client.chat.postMessage({
        channel: session.channel_id,
        thread_ts: session.thread_ts,
        text: `Thinking: ${trimmedText.slice(0, 150)}`,
        blocks: agentThoughtBlocks(trimmedText, duration_ms ?? 0),
      });
      res.json({ posted: true });
    } catch (err) {
      logger.error({ err, conversationId: conversation_id }, 'Failed to post agent thought');
      res.json({});
    }
  });

  router.post('/hook/tool-use', async (req, res) => {
    const { conversation_id, tool_name, tool_input } = req.body as ToolUsePayload;
    if (!conversation_id || !tool_name) {
      res.json({ allow: true });
      return;
    }

    const session = sessionStore.getByConversationId(conversation_id);
    if (!session || session.mode === 'silent') {
      res.json({ allow: true });
      return;
    }

    const handler = getToolHandler(tool_name);

    try {
      if (handler === 'ask_question') {
        const questions = (tool_input?.questions as { prompt: string; options: { id?: string; label: string }[] }[]) ?? [];
        const fallbackText = questions.map((q) => q.prompt).join('; ') || 'Agent is asking a question';

        await slackApp.client.chat.postMessage({
          channel: session.channel_id,
          thread_ts: session.thread_ts,
          text: fallbackText,
          blocks: askQuestionBlocks(questions, conversation_id),
        });

        if (session.mode === 'control') {
          const answer = await pendingAnswerStore.waitForReply(conversation_id, ASK_QUESTION_TIMEOUT_MS);
          if (answer) {
            res.json({ deny: true, answer });
            return;
          }
        }

        res.json({ allow: true });
        return;
      }

      await slackApp.client.chat.postMessage({
        channel: session.channel_id,
        thread_ts: session.thread_ts,
        text: `${tool_name}`,
        blocks: toolUseBlocks(tool_name, (tool_input as Record<string, unknown>) ?? {}),
      });
      res.json({ allow: true });
    } catch (err) {
      logger.error({ err, conversationId: conversation_id, toolName: tool_name }, 'Failed to post tool use');
      res.json({ allow: true });
    }
  });

  router.post('/hook/stop', async (req, res) => {
    const { conversation_id, status, loop_count } = req.body as StopPayload;
    if (!conversation_id) {
      res.status(400).json({ error: 'Missing conversation_id' });
      return;
    }

    const session = sessionStore.getByConversationId(conversation_id);
    if (!session || session.mode !== 'control') {
      res.json({});
      return;
    }

    try {
      const stopText = `Agent finished (status: ${status}, loop: ${loop_count}). Reply here to continue.`;
      await slackApp.client.chat.postMessage({
        channel: session.channel_id,
        thread_ts: session.thread_ts,
        text: stopText,
        blocks: stopPromptBlocks(status, loop_count),
      });

      const reply = await pendingReplyStore.waitForReply(conversation_id, config.longPollTimeoutMs);

      if (reply) {
        res.json({ followup_message: reply });
      } else {
        res.json({});
      }
    } catch (err) {
      logger.error({ err, conversationId: conversation_id }, 'Stop hook failed');
      res.json({});
    }
  });

  return router;
}
