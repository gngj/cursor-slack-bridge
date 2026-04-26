#!/bin/bash
set -uo pipefail

[ "${CURSOR_SLACK_DEBUG:-0}" = "1" ] && echo "$(date '+%Y-%m-%dT%H:%M:%S') stop" >> /tmp/cursor-slack-bridge-hooks.log

input=$(cat)
conversation_id=$(echo "$input" | jq -r '.conversation_id // empty' 2>/dev/null || echo "")
status=$(echo "$input" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
loop_count=$(echo "$input" | jq -r '.loop_count // 0' 2>/dev/null || echo "0")

if [ -z "$conversation_id" ]; then
  echo '{}'
  exit 0
fi

chat_title=$("$(dirname "$0")/_chat-title.sh" "$conversation_id" 2>/dev/null || echo "")

# Use --arg + `tonumber? // 0` so a non-numeric or null loop_count can't make
# `jq -n` error out (which would POST an empty body and drop the follow-up).
payload=$(jq -n \
  --arg cid "$conversation_id" \
  --arg s "$status" \
  --arg lc "$loop_count" \
  --arg title "$chat_title" \
  '{conversation_id: $cid, status: $s, loop_count: ($lc | tonumber? // 0), chat_title: $title}')

response=$(curl -sf --max-time 1800 -X POST http://127.0.0.1:8787/hook/stop \
  -H 'Content-Type: application/json' \
  -d "$payload" 2>/dev/null)
rc=$?

if [ $rc -eq 0 ] && [ -n "$response" ]; then
  echo "$response"
else
  echo '{}'
fi
