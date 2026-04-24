export type SessionMode = 'silent' | 'readonly' | 'control';
export type SessionStatus = 'active' | 'completed';

export interface Session {
  conversation_id: string;
  thread_ts: string;
  channel_id: string;
  mode: SessionMode;
  status: SessionStatus;
  repo_name: string | null;
  branch_name: string | null;
  workspace_path: string | null;
  worktree_name: string | null;
  chat_title: string | null;
  created_at: string;
  last_message_at: string;
}

export interface SessionStartPayload {
  conversation_id: string;
  repo_name?: string;
  branch_name?: string;
  workspace_path?: string;
  worktree_name?: string;
}

// `chat_title` is passed on agent-response and stop because those events fire
// at natural "end of turn" boundaries where refreshing the header is cheap and
// the title may have just changed (Cursor often names chats after the first
// few exchanges). It is intentionally omitted from agent-thought and tool-use,
// which fire many times per turn — re-reading the Cursor DB and re-rendering
// the Slack header on each tool call would add pointless overhead.
export interface AgentResponsePayload {
  conversation_id: string;
  text: string;
  chat_title?: string;
}

export interface AgentThoughtPayload {
  conversation_id: string;
  text: string;
  duration_ms: number;
}

export interface ToolUsePayload {
  conversation_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: string;
  duration?: number;
}

export interface StopPayload {
  conversation_id: string;
  status: string;
  loop_count: number;
  chat_title?: string;
}

export interface StopResponse {
  followup_message?: string;
}

export interface ModeChangePayload {
  mode: SessionMode;
}

export const MODE_COMMANDS: Record<string, SessionMode> = {
  watch: 'readonly',
  control: 'control',
  silent: 'silent',
};
