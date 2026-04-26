#!/bin/bash
set -uo pipefail

[ "${CURSOR_SLACK_DEBUG:-0}" = "1" ] && echo "$(date '+%Y-%m-%dT%H:%M:%S') agent-response" >> /tmp/cursor-slack-bridge-hooks.log

input=$(cat)
conversation_id=$(echo "$input" | jq -r '.conversation_id // empty' 2>/dev/null || echo "")
text=$(echo "$input" | jq -r '.text // empty' 2>/dev/null || echo "")
trimmed=$(echo "$text" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -z "$trimmed" ]; then
  echo '{}'
  exit 0
fi

chat_title=""
if [ -n "$conversation_id" ]; then
  chat_title=$("$(dirname "$0")/_chat-title.sh" "$conversation_id" 2>/dev/null || echo "")
fi

payload=$(jq -n \
  --arg cid "$conversation_id" \
  --arg t "$text" \
  --arg title "$chat_title" \
  '{conversation_id: $cid, text: $t, chat_title: $title}')

curl -sf --max-time 5 -X POST http://127.0.0.1:8787/hook/agent-response \
  -H 'Content-Type: application/json' \
  -d "$payload" > /dev/null 2>&1 || true
echo '{}'
