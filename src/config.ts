import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseBool(value: string | undefined, defaultValue: boolean, key?: string): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  // Use console here, not the Pino logger, because config is imported at
  // module init time before the logger is fully wired up.
  console.warn(
    `[config] Unrecognized boolean value ${JSON.stringify(value)}${key ? ` for ${key}` : ''}; using default ${defaultValue}`,
  );
  return defaultValue;
}

export const config = {
  slack: {
    botToken: requireEnv('SLACK_BOT_TOKEN'),
    appToken: requireEnv('SLACK_APP_TOKEN'),
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
    userId: requireEnv('SLACK_USER_ID'),
  },
  port: parseInt(process.env.PORT ?? '8787', 10),
  httpHost: process.env.HTTP_HOST ?? '127.0.0.1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  dbPath: process.env.DB_PATH ?? './data/sessions.db',
  longPollTimeoutMs: parseInt(process.env.LONG_POLL_TIMEOUT_MS ?? '1800000', 10),
  syncAgentThoughts: parseBool(process.env.SYNC_AGENT_THOUGHTS, true, 'SYNC_AGENT_THOUGHTS'),
} as const;
