# Cursor–Slack Bridge

A local Slack bot that bridges Cursor AI agent sessions to Slack DM threads,
enabling you to observe agent activity and optionally reply to control the
agent — all from Slack. Uses Socket Mode (no public server needed), runs on
macOS, and connects to Cursor via hook scripts.

## Features

- **Session tracking** — each Cursor conversation gets its own Slack thread
  showing repo name and branch
- **Three modes** — Silent, Watch (read-only), and Control (bidirectional),
  switchable via Block Kit buttons or text commands
- **Agent responses** — Markdown converted to Slack `mrkdwn`, long messages
  split across multiple blocks
- **Agent thoughts** — compact thinking previews with duration
- **Tool activity feed** — every tool use shown as a context line with
  tool-specific icons and summaries (Shell commands, file reads, grep patterns…)
- **AskQuestion support** — agent questions rendered as interactive buttons
  (with Slack-to-Cursor answer relay in control mode, pending Cursor bug fix)
- **Control mode** — reply to the agent from Slack via long-poll (30 min window)
- **Stop notification** — prominent prompt when the agent finishes and is
  waiting for input

## Slack App Setup

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it (e.g. "Cursor Bridge"), select your workspace.
3. **Enable Socket Mode:** Settings → Socket Mode → toggle on → generate an
   App-Level Token with the `connections:write` scope → copy this as
   `SLACK_APP_TOKEN` (starts with `xapp-`).
4. **Add Bot Token Scopes:** OAuth & Permissions → Bot Token Scopes → add:
   - `chat:write` — post messages, update messages, post ephemeral messages
   - `im:history` — read DM messages via event subscriptions
   - `im:write` — open DM conversations with users
   - `reactions:write` — add emoji reactions for delivery confirmations
5. **Subscribe to Events:** Event Subscriptions → toggle on → Subscribe to bot
   events → add `message.im`.
6. **Enable App Home Messages Tab:** App Home → Show Tabs → check "Allow users
   to send Slash commands and messages from the Messages tab".
7. **Enable Interactivity:** Interactivity & Shortcuts → toggle on (no URL
   needed for Socket Mode — it routes through the WebSocket).
8. **Install to Workspace:** Install App → copy the Bot User OAuth Token as
   `SLACK_BOT_TOKEN` (starts with `xoxb-`).
9. **Find your Slack User ID:** click your profile in Slack → three dots →
   "Copy member ID" → save as `SLACK_USER_ID`.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | — | Bot User OAuth token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | Yes | — | App-level token for Socket Mode (`xapp-…`) |
| `SLACK_SIGNING_SECRET` | No | — | Signing secret (not needed for Socket Mode) |
| `SLACK_USER_ID` | Yes | — | Your Slack member ID (bot DMs this user) |
| `PORT` | No | `8787` | HTTP server port |
| `LOG_LEVEL` | No | `info` | Pino log level (`debug`, `info`, `warn`, `error`, `fatal`) |
| `DB_PATH` | No | `./data/sessions.db` | SQLite database file path |
| `LONG_POLL_TIMEOUT_MS` | No | `1800000` | Control-mode long-poll timeout in ms (default 30 min) |

## Run Locally

```bash
npm install
cp .env.example .env
# Edit .env with your Slack tokens and user ID
npm run dev
```

## Run with Docker

```bash
cp .env.example .env
# Edit .env with your Slack tokens and user ID
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
    "afterAgentThought": [
      { "command": "~/.cursor/hooks/slack/hooks/agent-thought.sh" }
    ],
    "preToolUse": [
      { "command": "~/.cursor/hooks/slack/hooks/tool-use.sh", "timeout": 150 }
    ],
    "stop": [
      { "command": "~/.cursor/hooks/slack/hooks/stop.sh", "timeout": 1800 }
    ]
  }
}
```

If you already have hooks in `hooks.json`, merge the entries into the existing
arrays for each event.

### Hooks Reference

| Hook | Script | Purpose |
| --- | --- | --- |
| `sessionStart` | `session-start.sh` | Creates a Slack thread for the session (extracts repo/branch from `workspace_roots`) |
| `afterAgentResponse` | `agent-response.sh` | Posts agent output to Slack (Markdown → `mrkdwn` conversion, long message splitting) |
| `afterAgentThought` | `agent-thought.sh` | Posts compact thinking preview with duration |
| `preToolUse` | `tool-use.sh` | Posts tool activity feed; special handling for `AskQuestion` (buttons + long-poll answer relay) |
| `stop` | `stop.sh` | In control mode: posts prompt and long-polls for user reply (30 min timeout) |

## Testing

1. Start the bot: `npm run dev`
2. Start a new Cursor agent session — a DM thread appears in Slack showing the
   repo and branch.
3. Click **Watch** to see agent output, thoughts, and tool activity.
4. Click **Control** to also reply and direct the agent from Slack.
5. Click **Silent** to stop receiving messages.
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

- **Slack Bolt (Socket Mode)** — listens for DM events (`message.im`) and
  Block Kit button actions, handles mode switching, and delivers user replies
  to the pending-reply store.
- **Express HTTP server** — receives Cursor hook calls, posts messages to
  Slack threads, and long-polls for user replies in control mode.

**SQLite** (`better-sqlite3`, WAL mode) persists session state (including
repo name, branch, and workspace path) across restarts. In-memory stores hold
long-poll promises for control-mode replies and AskQuestion answers.

## Session Modes

| Mode | Set via | Agent output | Thoughts | Tool activity | Reply to agent |
| --- | --- | --- | --- | --- | --- |
| Silent (default) | button or `silent` | No | No | No | No |
| Watch | button or `watch` | Yes | Yes | Yes | No |
| Control | button or `control` | Yes | Yes | Yes | Yes (30 min window) |

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Returns `ok` |
| `GET` | `/sessions` | List all sessions |
| `PATCH` | `/sessions/:conversationId/mode` | Change session mode |
| `POST` | `/hook/session-start` | Creates session with repo/branch context |
| `POST` | `/hook/agent-response` | Posts agent output (Markdown → `mrkdwn`) |
| `POST` | `/hook/agent-thought` | Posts thinking preview |
| `POST` | `/hook/tool-use` | Posts tool activity; handles AskQuestion specially |
| `POST` | `/hook/stop` | Posts stop prompt; long-polls in control mode |

## Customising Tool Handlers

By default, every tool use is shown as a compact context line. Tools that
need special treatment (like `AskQuestion`) are registered in the
`SPECIAL_TOOLS` map in `src/server/routes/hookRoutes.ts`:

```typescript
const SPECIAL_TOOLS: Record<string, ToolHandler> = {
  AskQuestion: 'ask_question',
};
```

Add entries here and a corresponding handler branch to give any tool its own
UX.

## Known Limitations

- **AskQuestion hook bug** — Cursor currently does not fire `preToolUse` /
  `postToolUse` for the `AskQuestion` tool
  ([forum report](https://forum.cursor.com/t/askquestion-tool-does-not-trigger-cursor-hooks/152230)).
  The plumbing is ready and will work once Cursor fixes this.
- Hooks fire per-session; if the bot isn't running when a session starts, that
  session won't have a Slack thread.

## Future Ideas

- Wire a `sessionEnd` hook to mark sessions completed.
- Capture the first user prompt via `beforeSubmitPrompt` as a session title.
- Add a "discard stale replies" TTL to `PendingReplyStore`.
- Explore Cursor's hook timeout limits to optimise control-mode responsiveness.
