import { logger } from '../lib/logger.js';

interface PendingReply {
  resolve: (value: string | undefined) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PendingReplyStore {
  private pending = new Map<string, PendingReply>();

  waitForReply(conversationId: string, timeoutMs: number): Promise<string | undefined> {
    this.cancelExisting(conversationId);

    return new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(conversationId);
        logger.info({ conversationId }, 'Long-poll timed out');
        resolve(undefined);
      }, timeoutMs);

      this.pending.set(conversationId, { resolve, timer });
      logger.info({ conversationId, timeoutMs }, 'Long-poll started');
    });
  }

  deliverReply(conversationId: string, text: string): boolean {
    const entry = this.pending.get(conversationId);
    if (!entry) {
      return false;
    }
    clearTimeout(entry.timer);
    this.pending.delete(conversationId);
    entry.resolve(text);
    logger.info({ conversationId }, 'Reply delivered to long-poll');
    return true;
  }

  hasPending(conversationId: string): boolean {
    return this.pending.has(conversationId);
  }

  resolveAll(): void {
    for (const [conversationId, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.resolve(undefined);
      logger.info({ conversationId }, 'Resolved pending reply (shutdown)');
    }
    this.pending.clear();
  }

  private cancelExisting(conversationId: string): void {
    const existing = this.pending.get(conversationId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.resolve(undefined);
      this.pending.delete(conversationId);
      logger.info({ conversationId }, 'Replaced stale long-poll');
    }
  }
}
