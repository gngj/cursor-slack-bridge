#!/bin/bash
set -uo pipefail

[ "${CURSOR_SLACK_DEBUG:-0}" = "1" ] && echo "$(date '+%Y-%m-%dT%H:%M:%S') session-start" >> /tmp/cursor-slack-bridge-hooks.log

input=$(cat)
conversation_id=$(echo "$input" | jq -r '.conversation_id // empty' 2>/dev/null || echo "")

workspace=$(echo "$input" | jq -r '.workspace_roots[0] // empty' 2>/dev/null || echo "")

repo_name=""
branch_name=""
worktree_name=""
if [ -n "$workspace" ] && git -C "$workspace" rev-parse --git-dir >/dev/null 2>&1; then
  repo_name=$(git -C "$workspace" remote get-url origin 2>/dev/null | sed 's/.*\///' | sed 's/\.git$//')
  branch_name=$(git -C "$workspace" rev-parse --abbrev-ref HEAD 2>/dev/null)

  # Detect git worktree: git-dir and common-dir differ when inside a linked worktree
  git_dir=$(git -C "$workspace" rev-parse --absolute-git-dir 2>/dev/null)
  common_dir=$(git -C "$workspace" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ -n "$git_dir" ] && [ -n "$common_dir" ] && [ "$git_dir" != "$common_dir" ]; then
    worktree_name=$(basename "$workspace")
  fi
fi

if [ -z "$repo_name" ] && [ -n "$workspace" ]; then
  repo_name=$(basename "$workspace")
fi

payload=$(jq -n \
  --arg cid "$conversation_id" \
  --arg repo "$repo_name" \
  --arg branch "$branch_name" \
  --arg ws "$workspace" \
  --arg wt "$worktree_name" \
  '{conversation_id: $cid, repo_name: $repo, branch_name: $branch, workspace_path: $ws, worktree_name: $wt}')

curl -sf --max-time 5 -X POST http://127.0.0.1:8787/hook/session-start \
  -H 'Content-Type: application/json' \
  -d "$payload" > /dev/null 2>&1 || true
echo '{}'
