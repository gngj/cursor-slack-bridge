#!/bin/bash
set -uo pipefail

[ "${CURSOR_SLACK_DEBUG:-0}" = "1" ] && echo "$(date '+%Y-%m-%dT%H:%M:%S') agent-thought" >> /tmp/cursor-slack-bridge-hooks.log

input=$(cat)
conversation_id=$(echo "$input" | jq -r '.conversation_id // empty' 2>/dev/null || echo "")
text=$(echo "$input" | jq -r '.text // empty' 2>/dev/null || echo "")
duration_ms=$(echo "$input" | jq -r '.duration_ms // 0' 2>/dev/null || echo "0")
trimmed=$(echo "$text" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -z "$trimmed" ]; then
  echo '{}'
  exit 0
fi

payload=$(jq -n \
  --arg cid "$conversation_id" \
  --arg t "$text" \
  --arg d "$duration_ms" \
  '{conversation_id: $cid, text: $t, duration_ms: ($d | tonumber? // 0)}')

curl -sf --max-time 5 -X POST http://127.0.0.1:8787/hook/agent-thought \
  -H 'Content-Type: application/json' \
  -d "$payload" > /dev/null 2>&1 || true
echo '{}'
