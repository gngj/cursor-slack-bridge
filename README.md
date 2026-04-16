# Cursor–Slack Bridge

A local Slack bot that bridges Cursor AI agent sessions to Slack DM threads,
enabling you to observe agent output and optionally reply to control the agent —
all from Slack. Uses Socket Mode (no public server needed), runs on macOS, and
connects to Cursor via hook scripts.

## Slack App Setup

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it (e.g. "Cursor Bridge"), select your workspace.
3. **Enable Socket Mode:** Settings → Socket Mode → toggle on → generate an
   App-Level Token with the `connections:write` scope → copy this as
   `SLACK_APP_TOKEN` (starts with `xapp-`).
4. **Add Bot Token Scopes:** OAuth & Permissions → Bot Token Scopes → add
   `chat:write` and `im:history`.
5. **Subscribe to Events:** Event Subscriptions → toggle on → Subscribe to bot
   events → add `message.im`.
6. **Install to Workspace:** Install App → copy the Bot User OAuth Token as
   `SLACK_BOT_TOKEN` (starts with `xoxb-`).

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | — | Bot User OAuth token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | Yes | — | App-level token for Socket Mode (`xapp-…`) |
| `SLACK_SIGNING_SECRET` | No | — | Signing secret (not needed for Socket Mode) |
| `PORT` | No | `8787` | HTTP server port |
| `LOG_LEVEL` | No | `info` | Pino log level (`debug`, `info`, `warn`, `error`, `fatal`) |
| `DB_PATH` | No | `./data/sessions.db` | SQLite database file path |
| `LONG_POLL_TIMEOUT_MS` | No | `1800000` | Control-mode long-poll timeout in ms (default 30 min) |

## Run Locally

```bash
npm install
cp .env.example .env
# Edit .env with your Slack tokens
npm run dev
```

## Run with Docker

```bash
cp .env.example .env
# Edit .env with your Slack tokens
docker compose up -d
```

The container binds to `127.0.0.1:8787` and persists the SQLite database in
`./data/`.

## Cursor Hook Setup

Add to `~/.cursor/hooks.json` (global) or `.cursor/hooks.json` (per-project):

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "~/.cursor/hooks/slack/hooks/session-start.sh" }
    ],
    "afterAgentResponse": [
      { "command": "~/.cursor/hooks/slack/hooks/agent-response.sh" }
    ],
    "stop": [
      { "command": "~/.cursor/hooks/slack/hooks/stop.sh", "timeout": 1800 }
    ]
  }
}
```

If you already have hooks in `hooks.json`, merge the entries into the existing
arrays for each event.

## Testing

1. Start the bot: `npm run dev`
2. Open Slack and DM the bot — a session thread is created when the next Cursor
   session starts.
3. In the thread, type `watch` to see agent messages.
4. Type `control` to also be able to reply and direct the agent.
5. Type `silent` to go back to no output.
6. Test the health endpoint:
   ```bash
   curl http://127.0.0.1:8787/health
   ```
7. List sessions:
   ```bash
   curl http://127.0.0.1:8787/sessions
   ```

## Architecture

Two subsystems run in a single process:

- **Slack Bolt (Socket Mode)** — listens for DM events (`message.im`), handles
  mode-change commands (`watch` / `control` / `silent`), and delivers user
  replies to the pending-reply store.
- **Express HTTP server** — receives Cursor hook calls (`session-start`,
  `agent-response`, `stop`), posts messages to Slack threads, and long-polls for
  user replies in control mode.

**SQLite** (`better-sqlite3`, WAL mode) persists session state across restarts.
An in-memory `Map` holds long-poll promises for the control-mode reply flow.

## Session Modes

| Mode | Set via | Agent output in Slack | Reply controls agent |
| --- | --- | --- | --- |
| Silent (default) | `silent` | No | No |
| Read-only | `watch` | Yes | No |
| Control | `control` | Yes | Yes (30 min window) |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns `ok` |
| `GET` | `/sessions` | List all sessions |
| `PATCH` | `/sessions/:conversationId/mode` | Change session mode |
| `POST` | `/hook/session-start` | Called by `sessionStart` hook |
| `POST` | `/hook/agent-response` | Called by `afterAgentResponse` hook |
| `POST` | `/hook/stop` | Called by `stop` hook (long-polls in control mode) |

## Future Ideas

- Wire a `sessionEnd` hook to mark sessions completed.
- Add Block Kit formatting for richer Slack messages.
- Add a "discard stale replies" TTL to `PendingReplyStore`.
- Namespace sessions by workspace path for multi-project support.
- Explore Cursor's hook timeout limits to optimise control-mode responsiveness.
