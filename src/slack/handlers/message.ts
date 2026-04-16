import type { App } from '@slack/bolt';
import type { SessionStore } from '../../store/sessionStore.js';
import type { PendingReplyStore } from '../../store/pendingReplyStore.js';
import { MODE_COMMANDS } from '../../types.js';
import { sessionMessageBlocks, sessionMessageText, type SessionContext } from '../blocks.js';
import { logger } from '../../lib/logger.js';

export function registerMessageHandler(
  app: App,
  sessionStore: SessionStore,
  pendingReplyStore: PendingReplyStore,
): void {
  app.event('message', async ({ event, client }) => {
    if (!('text' in event) || !event.text) return;
    if ('subtype' in event && event.subtype) return;
    if ('bot_id' in event && event.bot_id) return;
    if (!('thread_ts' in event) || !event.thread_ts) return;

    const threadTs = event.thread_ts;
    const text = event.text.trim();
    const eventTs = event.ts;
    const userId = 'user' in event ? event.user : undefined;
    const channelId = 'channel' in event ? event.channel : undefined;

    const session = sessionStore.getByThreadTs(threadTs);
    if (!session) {
      logger.debug({ threadTs }, 'Message in unknown thread, ignoring');
      return;
    }

    const modeCommand = MODE_COMMANDS[text.toLowerCase()];
    if (modeCommand) {
      sessionStore.updateMode(session.conversation_id, modeCommand);
      logger.info({ conversationId: session.conversation_id, mode: modeCommand }, 'Mode changed');

      const ctx: SessionContext = {
        conversationId: session.conversation_id,
        repoName: session.repo_name,
        branchName: session.branch_name,
        workspacePath: session.workspace_path,
      };
      await client.chat.update({
        channel: session.channel_id,
        ts: session.thread_ts,
        text: sessionMessageText(ctx, modeCommand),
        blocks: sessionMessageBlocks(ctx, modeCommand),
      });

      if (channelId) {
        await client.reactions.add({ channel: channelId, timestamp: eventTs, name: 'white_check_mark' }).catch(() => {});
      }
      return;
    }

    if (session.mode === 'control') {
      const delivered = pendingReplyStore.deliverReply(session.conversation_id, text);
      if (channelId) {
        const reaction = delivered ? 'white_check_mark' : 'warning';
        await client.reactions.add({ channel: channelId, timestamp: eventTs, name: reaction }).catch(() => {});
      }
      logger.info(
        { conversationId: session.conversation_id, userId, delivered },
        'Reply from Slack',
      );
    }

    sessionStore.touchLastMessage(session.conversation_id);
  });
}
