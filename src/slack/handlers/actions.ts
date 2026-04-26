import type { App } from '@slack/bolt';
import type { SessionStore } from '../../store/sessionStore.js';
import type { PendingReplyStore } from '../../store/pendingReplyStore.js';
import type { SessionMode } from '../../types.js';
import { sessionContextFromRow, sessionMessageBlocks, sessionMessageText } from '../blocks.js';
import { logger } from '../../lib/logger.js';

const MODE_ACTIONS: Record<string, SessionMode> = {
  set_mode_silent: 'silent',
  set_mode_readonly: 'readonly',
  set_mode_control: 'control',
};

export function registerActionHandlers(
  app: App,
  sessionStore: SessionStore,
  pendingAnswerStore: PendingReplyStore,
): void {
  for (const actionId of Object.keys(MODE_ACTIONS)) {
    app.action(actionId, async ({ ack, body, client }) => {
      await ack();

      const mode = MODE_ACTIONS[actionId];
      if (!mode || body.type !== 'block_actions') return;

      const channelId = body.channel?.id;
      if (!channelId) return;

      const messageTs = body.message?.ts;
      const threadTs =
        body.message && 'thread_ts' in body.message ? body.message.thread_ts : messageTs;
      const lookupTs = threadTs ?? messageTs;
      if (!lookupTs) return;

      const session = sessionStore.getByThreadTs(lookupTs);
      if (!session) {
        logger.warn({ lookupTs }, 'Button click in unknown session');
        return;
      }

      sessionStore.updateMode(session.conversation_id, mode);
      logger.info({ conversationId: session.conversation_id, mode }, 'Mode changed via button');

      const ctx = sessionContextFromRow(session);
      await client.chat.update({
        channel: session.channel_id,
        ts: session.thread_ts,
        text: sessionMessageText(ctx, mode),
        blocks: sessionMessageBlocks(ctx, mode),
      });
    });
  }

  app.action(/^ask_[a-f0-9]+_q\d+_opt\d+$/, async ({ ack, body, client, action }) => {
    await ack();

    if (body.type !== 'block_actions' || action.type !== 'button') return;

    let payload: { conversation_id?: string; label?: string };
    try {
      payload = JSON.parse(action.value ?? '{}');
    } catch {
      return;
    }

    const conversationId = payload.conversation_id;
    const label = payload.label;
    if (!conversationId || !label) return;

    const delivered = pendingAnswerStore.deliverReply(conversationId, label);

    const channelId = body.channel?.id;
    if (channelId) {
      if (delivered) {
        await client.reactions.add({
          channel: channelId,
          timestamp: body.message?.ts ?? '',
          name: 'white_check_mark',
        }).catch(() => {});
      } else {
        await client.chat.postEphemeral({
          channel: channelId,
          user: body.user.id,
          text: 'No pending question — answer in Cursor instead.',
        });
      }
    }

    logger.info({ conversationId, label, delivered }, 'AskQuestion answer from Slack');
  });
}
