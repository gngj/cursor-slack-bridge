import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Session, SessionMode, SessionStatus } from '../types.js';
import { logger } from '../lib/logger.js';

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
    logger.info({ dbPath }, 'SessionStore initialized');
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        conversation_id TEXT PRIMARY KEY,
        thread_ts TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'silent',
        status TEXT NOT NULL DEFAULT 'active',
        repo_name TEXT,
        branch_name TEXT,
        workspace_path TEXT,
        worktree_name TEXT,
        chat_title TEXT,
        created_at TEXT NOT NULL,
        last_message_at TEXT NOT NULL
      )
    `);

    const cols = this.db.pragma('table_info(sessions)') as { name: string }[];
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has('repo_name')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN repo_name TEXT');
    }
    if (!colNames.has('branch_name')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN branch_name TEXT');
    }
    if (!colNames.has('workspace_path')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN workspace_path TEXT');
    }
    if (!colNames.has('worktree_name')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN worktree_name TEXT');
    }
    if (!colNames.has('chat_title')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN chat_title TEXT');
    }
  }

  create(session: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (conversation_id, thread_ts, channel_id, mode, status, repo_name, branch_name, workspace_path, worktree_name, chat_title, created_at, last_message_at)
         VALUES (@conversation_id, @thread_ts, @channel_id, @mode, @status, @repo_name, @branch_name, @workspace_path, @worktree_name, @chat_title, @created_at, @last_message_at)`,
      )
      .run(session);
  }

  getByConversationId(conversationId: string): Session | undefined {
    return this.db
      .prepare('SELECT * FROM sessions WHERE conversation_id = ?')
      .get(conversationId) as Session | undefined;
  }

  getByThreadTs(threadTs: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE thread_ts = ?').get(threadTs) as
      | Session
      | undefined;
  }

  listAll(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as Session[];
  }

  updateMode(conversationId: string, mode: SessionMode): void {
    this.db
      .prepare('UPDATE sessions SET mode = ? WHERE conversation_id = ?')
      .run(mode, conversationId);
  }

  updateStatus(conversationId: string, status: SessionStatus): void {
    this.db
      .prepare('UPDATE sessions SET status = ? WHERE conversation_id = ?')
      .run(status, conversationId);
  }

  updateChatTitle(conversationId: string, chatTitle: string | null): void {
    this.db
      .prepare('UPDATE sessions SET chat_title = ? WHERE conversation_id = ?')
      .run(chatTitle, conversationId);
  }

  touchLastMessage(conversationId: string): void {
    this.db
      .prepare('UPDATE sessions SET last_message_at = ? WHERE conversation_id = ?')
      .run(new Date().toISOString(), conversationId);
  }

  deleteByConversationId(conversationId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE conversation_id = ?').run(conversationId);
  }

  close(): void {
    this.db.close();
  }
}
