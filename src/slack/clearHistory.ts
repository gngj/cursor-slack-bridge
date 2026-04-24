import type { WebClient } from '@slack/web-api';
import type { SessionStore } from '../store/sessionStore.js';
import type { PendingReplyStore } from '../store/pendingReplyStore.js';
import { logger } from '../lib/logger.js';

export interface ClearResult {
  deleted: number;
  preservedSessions: number;
}

// Cache the bot user id across clears — it's stable for the life of the token
// and each call to auth.test() costs an extra API round-trip (rate-limited).
let cachedBotUserId: string | null = null;

async function resolveBotUserId(client: WebClient): Promise<string> {
  if (cachedBotUserId) return cachedBotUserId;
  const authRes = await client.auth.test();
  if (!authRes.user_id) {
    throw new Error('Could not resolve bot user id from auth.test');
  }
  cachedBotUserId = authRes.user_id;
  return cachedBotUserId;
}

function isSessionPreserved(
  conversationId: string,
  pendingReplyStore: PendingReplyStore,
  pendingAnswerStore: PendingReplyStore,
): boolean {
  return (
    pendingReplyStore.hasPending(conversationId) || pendingAnswerStore.hasPending(conversationId)
  );
}

export async function clearBotHistory(
  client: WebClient,
  channel: string,
  sessionStore: SessionStore,
  pendingReplyStore: PendingReplyStore,
  pendingAnswerStore: PendingReplyStore,
): Promise<ClearResult> {
  const botUserId = await resolveBotUserId(client);

  // Snapshot preserved threads at the start so we don't walk into them. We
  // also re-check `hasPending` before each session delete at the end of the
  // loop to avoid races with a long-poll that starts mid-clear (M3).
  const initialSessions = sessionStore.listAll();
  const preservedThreadTs = new Set<string>();
  for (const s of initialSessions) {
    if (isSessionPreserved(s.conversation_id, pendingReplyStore, pendingAnswerStore)) {
      preservedThreadTs.add(s.thread_ts);
    }
  }

  let deleted = 0;
  let cursor: string | undefined;

  do {
    const history = await client.conversations.history({
      channel,
      cursor,
      limit: 200,
    });
    const messages = history.messages ?? [];
    for (const msg of messages) {
      if (!msg.ts) continue;

      // Preserved threads are skipped entirely — don't walk their replies
      // either, since the "Reply here to continue" prompt is often the thing
      // the long-poll is waiting behind (M5).
      if (preservedThreadTs.has(msg.ts)) continue;

      const replyCount = (msg as { reply_count?: number }).reply_count ?? 0;
      if (replyCount > 0) {
        let replyCursor: string | undefined;
        do {
          const replies = await client.conversations.replies({
            channel,
            ts: msg.ts,
            cursor: replyCursor,
            limit: 200,
          });
          const replyMsgs = replies.messages ?? [];
          for (const r of replyMsgs) {
            if (!r.ts || r.ts === msg.ts) continue;
            if (r.user !== botUserId) continue;
            if (await tryDelete(client, channel, r.ts)) deleted++;
          }
          replyCursor = replies.response_metadata?.next_cursor || undefined;
        } while (replyCursor);
      }

      if (msg.user === botUserId) {
        if (await tryDelete(client, channel, msg.ts)) deleted++;
      }
    }
    cursor = history.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // Re-check pending state at delete time. A session that had no pending
  // reply when we started but opened one mid-clear should survive.
  let preservedSessions = 0;
  const finalSessions = sessionStore.listAll();
  for (const s of finalSessions) {
    if (isSessionPreserved(s.conversation_id, pendingReplyStore, pendingAnswerStore)) {
      preservedSessions++;
      continue;
    }
    sessionStore.deleteByConversationId(s.conversation_id);
  }

  return { deleted, preservedSessions };
}

async function tryDelete(client: WebClient, channel: string, ts: string): Promise<boolean> {
  try {
    await client.chat.delete({ channel, ts });
    return true;
  } catch (err) {
    // WebClient auto-retries on 429 when the app is configured with a retry
    // policy (see createSlackApp). Remaining errors typically mean the message
    // was already deleted or we lost edit permission — log and continue.
    logger.warn({ err, ts }, 'Failed to delete message');
    return false;
  }
}
