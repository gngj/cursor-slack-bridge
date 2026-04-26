import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from './logger.js';

function defaultDbPath(): string | null {
  const override = process.env.CURSOR_STATE_DB;
  if (override) return override;

  const home = homedir();
  const candidates = [
    // macOS
    join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    // Linux
    join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    // Windows (rarely, but harmless to check)
    process.env.APPDATA
      ? join(process.env.APPDATA, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
      : '',
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export interface CursorChatInfo {
  name: string | null;
  subtitle: string | null;
}

let cachedDb: Database.Database | null = null;
let cachedPath: string | null = null;
let cachedSelect: Database.Statement | null = null;
let loggedMissing = false;

function openDb(): Database.Database | null {
  const path = defaultDbPath();
  if (!path) {
    if (!loggedMissing) {
      logger.info(
        'Cursor state DB not found; chat titles rely on payload (OK for Docker deployments)',
      );
      loggedMissing = true;
    }
    return null;
  }

  if (cachedDb && cachedPath === path) return cachedDb;

  try {
    if (cachedDb) {
      try {
        cachedDb.close();
      } catch {
        // ignore
      }
    }
    cachedDb = new Database(path, { readonly: true, fileMustExist: true });
    cachedPath = path;
    cachedSelect = null;
    return cachedDb;
  } catch (err) {
    logger.warn({ err, path }, 'Failed to open Cursor state DB');
    cachedDb = null;
    cachedPath = null;
    cachedSelect = null;
    return null;
  }
}

export function getChatInfo(conversationId: string): CursorChatInfo | null {
  const db = openDb();
  if (!db) return null;

  try {
    if (!cachedSelect) {
      cachedSelect = db.prepare('SELECT value FROM cursorDiskKV WHERE key = ?');
    }
    const row = cachedSelect.get(`composerData:${conversationId}`) as
      | { value: string | Buffer }
      | undefined;

    if (!row?.value) return null;
    const raw = typeof row.value === 'string' ? row.value : row.value.toString('utf8');
    const parsed = JSON.parse(raw) as { name?: unknown; subtitle?: unknown };
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null;
    const subtitle =
      typeof parsed.subtitle === 'string' && parsed.subtitle.trim()
        ? parsed.subtitle.trim()
        : null;

    return { name, subtitle };
  } catch (err) {
    logger.debug({ err, conversationId }, 'Failed to read chat info from Cursor DB');
    return null;
  }
}

export function closeCursorDb(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {
      // ignore
    }
    cachedDb = null;
    cachedPath = null;
    cachedSelect = null;
  }
}
