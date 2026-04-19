import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
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
} as const;
