import type { App } from '@slack/bolt';
import type { SessionStore } from '../../store/sessionStore.js';
import type { PendingReplyStore } from '../../store/pendingReplyStore.js';
import { MODE_COMMANDS } from '../../types.js';
import { sessionContextFromRow, sessionMessageBlocks, sessionMessageText } from '../blocks.js';
import { logger } from '../../lib/logger.js';
import { clearBotHistory } from '../clearHistory.js';

const CLEAR_COMMAND = 'clear';

export function registerMessageHandler(
  app: App,
  sessionStore: SessionStore,
  pendingReplyStore: PendingReplyStore,
  pendingAnswerStore: PendingReplyStore,
): void {
  app.event('message', async ({ event, client }) => {
    if (!('text' in event) || !event.text) return;
    if ('subtype' in event && event.subtype) return;
    if ('bot_id' in event && event.bot_id) return;

    const text = event.text.trim();
    const eventTs = event.ts;
    const userId = 'user' in event ? event.user : undefined;
    const channelId = 'channel' in event ? event.channel : undefined;

    if (text.toLowerCase() === CLEAR_COMMAND && channelId) {
      logger.info({ channelId, userId }, 'Clear command received via DM');
      try {
        const { deleted, preservedSessions } = await clearBotHistory(
          client,
          channelId,
          sessionStore,
          pendingReplyStore,
          pendingAnswerStore,
        );
        await client.reactions
          .add({ channel: channelId, timestamp: eventTs, name: 'white_check_mark' })
          .catch(() => {});
        const preservedNote =
          preservedSessions > 0
            ? ` Preserved ${preservedSessions} active session${preservedSessions === 1 ? '' : 's'} (waiting on a reply).`
            : '';
        await client.chat.postMessage({
          channel: channelId,
          text: `Cleared ${deleted} bot message${deleted === 1 ? '' : 's'}.${preservedNote}`,
        });
        logger.info({ deleted, preservedSessions }, 'Cleared bot history');
      } catch (err) {
        logger.error({ err }, 'Failed to clear bot history');
        await client.reactions
          .add({ channel: channelId, timestamp: eventTs, name: 'warning' })
          .catch(() => {});
      }
      return;
    }

    if (!('thread_ts' in event) || !event.thread_ts) return;
    const threadTs = event.thread_ts;

    const session = sessionStore.getByThreadTs(threadTs);
    if (!session) {
      logger.debug({ threadTs }, 'Message in unknown thread, ignoring');
      return;
    }

    const modeCommand = MODE_COMMANDS[text.toLowerCase()];
    if (modeCommand) {
      sessionStore.updateMode(session.conversation_id, modeCommand);
      logger.info({ conversationId: session.conversation_id, mode: modeCommand }, 'Mode changed');

      const ctx = sessionContextFromRow(session);
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
