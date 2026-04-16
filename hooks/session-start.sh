#!/bin/bash
input=$(cat)
conversation_id=$(echo "$input" | grep -o '"conversation_id":"[^"]*"' | head -1 | sed 's/"conversation_id":"//;s/"$//')

workspace=$(echo "$input" | jq -r '.workspace_roots[0] // empty' 2>/dev/null || echo "")

repo_name=""
branch_name=""
if [ -n "$workspace" ] && [ -d "$workspace/.git" ] || git -C "$workspace" rev-parse --git-dir >/dev/null 2>&1; then
  repo_name=$(git -C "$workspace" remote get-url origin 2>/dev/null | sed 's/.*\///' | sed 's/\.git$//')
  branch_name=$(git -C "$workspace" rev-parse --abbrev-ref HEAD 2>/dev/null)
fi

if [ -z "$repo_name" ] && [ -n "$workspace" ]; then
  repo_name=$(basename "$workspace")
fi

payload=$(jq -n \
  --arg cid "$conversation_id" \
  --arg repo "$repo_name" \
  --arg branch "$branch_name" \
  --arg ws "$workspace" \
  '{conversation_id: $cid, repo_name: $repo, branch_name: $branch, workspace_path: $ws}')

curl -sf --max-time 5 -X POST http://127.0.0.1:8787/hook/session-start \
  -H 'Content-Type: application/json' \
  -d "$payload" > /dev/null 2>&1 || true
