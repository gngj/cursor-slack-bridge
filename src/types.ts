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
  created_at: string;
  last_message_at: string;
}

export interface SessionStartPayload {
  conversation_id: string;
  repo_name?: string;
  branch_name?: string;
  workspace_path?: string;
}

export interface AgentResponsePayload {
  conversation_id: string;
  text: string;
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
