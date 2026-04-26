#!/bin/bash
# Print the Cursor chat tab title for a given conversation_id.
#
# Why this script exists: when the bridge runs in Docker it can't reach the
# host's Cursor state DB, so each hook reads the title here (on the host,
# where Cursor writes it) and passes it in the HTTP payload. When the bridge
# runs natively, `src/lib/cursorDb.ts` does the same lookup server-side and
# this script is redundant but harmless. Prints empty string if the DB, row,
# or name field is not available.
#
# The sqlite3 CLI doesn't easily bind parameters, so we sanitize the
# conversation_id to [a-zA-Z0-9-] before splicing it into the query. Cursor
# only ever produces UUIDs for this field, so the filter should be a no-op
# against real input.
#
# Usage: _chat-title.sh <conversation_id>
set -uo pipefail

cid="${1:-}"
[ -z "$cid" ] && exit 0

db="${CURSOR_STATE_DB:-$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb}"
[ ! -f "$db" ] && exit 0
command -v sqlite3 >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

safe_cid=$(printf '%s' "$cid" | tr -cd 'a-zA-Z0-9-')
[ -z "$safe_cid" ] && exit 0

sqlite3 -readonly "$db" \
  "SELECT value FROM cursorDiskKV WHERE key = 'composerData:$safe_cid' LIMIT 1" 2>/dev/null \
  | jq -r 'select(type=="object") | .name // empty' 2>/dev/null
