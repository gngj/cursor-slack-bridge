#!/bin/bash
[ "${CURSOR_SLACK_DEBUG:-0}" = "1" ] && echo "$(date '+%Y-%m-%dT%H:%M:%S') tool-use" >> /tmp/cursor-slack-bridge-hooks.log
input=$(cat)
conversation_id=$(echo "$input" | grep -o '"conversation_id":"[^"]*"' | head -1 | sed 's/"conversation_id":"//;s/"$//')
tool_name=$(echo "$input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")
if [ -z "$tool_name" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi
tool_input=$(echo "$input" | jq -c '.tool_input // {}' 2>/dev/null || echo '{}')
payload=$(jq -n --arg cid "$conversation_id" --arg tn "$tool_name" --argjson ti "$tool_input" '{conversation_id: $cid, tool_name: $tn, tool_input: $ti}')

response=$(curl -sf --max-time 130 -X POST http://127.0.0.1:8787/hook/tool-use \
  -H 'Content-Type: application/json' \
  -d "$payload" 2>/dev/null || echo '{"allow":true}')

deny=$(echo "$response" | jq -r '.deny // empty' 2>/dev/null)
answer=$(echo "$response" | jq -r '.answer // empty' 2>/dev/null)

if [ "$deny" = "true" ] && [ -n "$answer" ]; then
  jq -n --arg msg "The user answered from Slack: $answer" '{permission: "deny", agent_message: $msg}'
else
  echo '{"permission":"allow"}'
fi
