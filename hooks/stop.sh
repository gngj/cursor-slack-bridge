#!/bin/bash
[ "${CURSOR_SLACK_DEBUG:-0}" = "1" ] && echo "$(date '+%Y-%m-%dT%H:%M:%S') stop" >> /tmp/cursor-slack-bridge-hooks.log
input=$(cat)
conversation_id=$(echo "$input" | jq -r '.conversation_id // empty' 2>/dev/null)
status=$(echo "$input" | jq -r '.status // "unknown"' 2>/dev/null)
loop_count=$(echo "$input" | jq -r '.loop_count // 0' 2>/dev/null)

if [ -z "$conversation_id" ]; then
  echo '{}'
  exit 0
fi

response=$(curl -sf --max-time 1800 -X POST http://127.0.0.1:8787/hook/stop \
  -H 'Content-Type: application/json' \
  -d "{\"conversation_id\":\"$conversation_id\",\"status\":\"$status\",\"loop_count\":$loop_count}" 2>/dev/null)

if [ $? -eq 0 ] && [ -n "$response" ]; then
  echo "$response"
else
  echo '{}'
fi
