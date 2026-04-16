import { slackifyMarkdown } from 'slackify-markdown';
import type { SessionMode } from '../types.js';

const MODE_LABELS: Record<SessionMode, { text: string; emoji: string; description: string }> = {
  silent: { text: 'Silent', emoji: ':no_bell:', description: 'No output to Slack' },
  readonly: { text: 'Watch', emoji: ':eyes:', description: 'See agent output' },
  control: { text: 'Control', emoji: ':joystick:', description: 'See output + reply to agent' },
};

export function modeButtons(currentMode: SessionMode) {
  return {
    type: 'actions' as const,
    elements: (['silent', 'readonly', 'control'] as SessionMode[]).map((mode) => {
      const label = MODE_LABELS[mode];
      const isCurrent = mode === currentMode;
      return {
        type: 'button' as const,
        text: {
          type: 'plain_text' as const,
          text: `${label.emoji} ${label.text}`,
        },
        action_id: `set_mode_${mode}`,
        ...(isCurrent ? { style: 'primary' as const } : {}),
      };
    }),
  };
}

export interface SessionContext {
  conversationId: string;
  repoName?: string | null;
  branchName?: string | null;
  workspacePath?: string | null;
}

function sessionTitle(ctx: SessionContext): string {
  const repo = ctx.repoName || 'unknown';
  const branch = ctx.branchName;
  if (branch) {
    return `*${repo}*  :seedling:  \`${branch}\``;
  }
  return `*${repo}*`;
}

function sessionTitlePlain(ctx: SessionContext): string {
  const repo = ctx.repoName || 'unknown';
  const branch = ctx.branchName;
  if (branch) return `${repo} · ${branch}`;
  return repo;
}

export function sessionMessageBlocks(ctx: SessionContext, currentMode: SessionMode) {
  const label = MODE_LABELS[currentMode];
  const title = sessionTitle(ctx);
  const sid = ctx.conversationId.slice(0, 8);

  return [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: title,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `${label.emoji}  *${label.text}* — ${label.description}`,
      },
    },
    modeButtons(currentMode),
    {
      type: 'context' as const,
      elements: [{ type: 'mrkdwn' as const, text: `\`${sid}\`` }],
    },
  ];
}

export function sessionMessageText(ctx: SessionContext, currentMode: SessionMode): string {
  const label = MODE_LABELS[currentMode];
  const title = sessionTitlePlain(ctx);
  return `${title} · ${label.text} — ${label.description}`;
}

const MAX_SECTION_TEXT = 3000;
const MAX_BLOCKS = 48;

export function mdToSlack(markdown: string): string {
  return slackifyMarkdown(markdown);
}

function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt <= 0) splitAt = maxLen;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }

  return chunks;
}

export function agentResponseBlocks(markdownText: string) {
  const slackText = mdToSlack(markdownText);
  const chunks = splitText(slackText, MAX_SECTION_TEXT);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'context' as const,
      elements: [{ type: 'mrkdwn' as const, text: ':robot_face: *Agent*' }],
    },
  ];

  for (const chunk of chunks.slice(0, MAX_BLOCKS - 2)) {
    blocks.push({
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: chunk },
    });
  }

  blocks.push({ type: 'divider' as const });
  return blocks;
}

const THOUGHT_PREVIEW_LEN = 150;

export function agentThoughtBlocks(thinkingText: string, durationMs: number) {
  const firstLine = thinkingText.split('\n').find((l) => l.trim()) || thinkingText;
  const preview =
    firstLine.length > THOUGHT_PREVIEW_LEN
      ? firstLine.slice(0, THOUGHT_PREVIEW_LEN) + '…'
      : firstLine;
  const seconds = Math.round(durationMs / 1000);

  return [
    {
      type: 'context' as const,
      elements: [
        {
          type: 'mrkdwn' as const,
          text: `:thought_balloon: _${preview}_ (${seconds}s)`,
        },
      ],
    },
  ];
}

const TOOL_EMOJI: Record<string, string> = {
  Shell: ':terminal:',
  Read: ':page_facing_up:',
  Write: ':pencil2:',
  Grep: ':mag:',
  Glob: ':open_file_folder:',
  Delete: ':wastebasket:',
  Task: ':arrow_heading_down:',
  SemanticSearch: ':mag_right:',
  WebSearch: ':globe_with_meridians:',
  WebFetch: ':link:',
  EditNotebook: ':notebook:',
  StrReplace: ':pencil:',
  SwitchMode: ':arrows_counterclockwise:',
  AskQuestion: ':raising_hand:',
  ReadLints: ':warning:',
  TodoWrite: ':ballot_box_with_check:',
  GenerateImage: ':frame_with_picture:',
};
const DEFAULT_TOOL_EMOJI = ':hammer_and_wrench:';

function toolSummary(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Shell':
      return `\`${truncateLabel(String(toolInput.command ?? ''), 80)}\``;
    case 'Read':
      return `\`${truncateLabel(String(toolInput.path ?? ''), 80)}\``;
    case 'Write':
    case 'StrReplace':
      return `\`${truncateLabel(String(toolInput.path ?? ''), 80)}\``;
    case 'Grep':
      return `\`${truncateLabel(String(toolInput.pattern ?? ''), 60)}\`${toolInput.path ? ` in \`${truncateLabel(String(toolInput.path), 40)}\`` : ''}`;
    case 'Glob':
      return `\`${truncateLabel(String(toolInput.glob_pattern ?? ''), 60)}\``;
    case 'Delete':
      return `\`${truncateLabel(String(toolInput.path ?? ''), 80)}\``;
    case 'Task':
      return truncateLabel(String(toolInput.description ?? ''), 80);
    case 'SemanticSearch':
      return truncateLabel(String(toolInput.query ?? ''), 80);
    case 'WebSearch':
      return truncateLabel(String(toolInput.search_term ?? ''), 80);
    case 'WebFetch':
      return `\`${truncateLabel(String(toolInput.url ?? ''), 80)}\``;
    case 'SwitchMode':
      return String(toolInput.target_mode_id ?? '');
    case 'TodoWrite':
      return '';
    default:
      return '';
  }
}

export function toolUseBlocks(toolName: string, toolInput: Record<string, unknown>) {
  const emoji = TOOL_EMOJI[toolName] ?? DEFAULT_TOOL_EMOJI;
  const summary = toolSummary(toolName, toolInput);
  const text = summary ? `${emoji} *${toolName}*  ${summary}` : `${emoji} *${toolName}*`;

  return [
    {
      type: 'context' as const,
      elements: [{ type: 'mrkdwn' as const, text }],
    },
  ];
}

const OTHER_PATTERN = /^other\.{0,3}$/i;
const MAX_BUTTON_TEXT = 75;

function truncateLabel(label: string, max: number): string {
  return label.length > max ? label.slice(0, max - 1) + '…' : label;
}

export function askQuestionBlocks(
  questions: { prompt: string; options: { id?: string; label: string }[] }[],
  conversationId?: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'context' as const,
      elements: [{ type: 'mrkdwn' as const, text: ':raising_hand: *Agent is asking a question*' }],
    },
  ];

  const cidShort = conversationId?.slice(0, 8) ?? 'unknown';

  for (const [qi, q] of questions.entries()) {
    blocks.push({
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `*${q.prompt}*` },
    });

    const concreteOptions = q.options.filter((o) => !OTHER_PATTERN.test(o.label.trim()));
    const hasOther = q.options.some((o) => OTHER_PATTERN.test(o.label.trim()));

    if (concreteOptions.length > 0) {
      blocks.push({
        type: 'actions' as const,
        elements: concreteOptions.map((o, i) => ({
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: `${String.fromCharCode(65 + i)}. ${truncateLabel(o.label, MAX_BUTTON_TEXT)}`,
          },
          action_id: `ask_${cidShort}_q${qi}_opt${i}`,
          value: JSON.stringify({
            conversation_id: conversationId,
            question_index: qi,
            option_index: i,
            label: o.label,
          }),
        })),
      });
    }

    if (hasOther) {
      blocks.push({
        type: 'context' as const,
        elements: [
          { type: 'mrkdwn' as const, text: '_:speech_balloon: Other — type your answer in Cursor_' },
        ],
      });
    }
  }

  blocks.push({ type: 'divider' as const });
  return blocks;
}

export function stopPromptBlocks(status: string, loopCount: number) {
  return [
    { type: 'divider' as const },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `:white_square_button: Agent finished — status: *${status}*, loop: *${loopCount}*\n*Reply here to continue the conversation.*`,
      },
    },
  ];
}

export function systemMessageBlocks(text: string) {
  return [
    {
      type: 'context' as const,
      elements: [{ type: 'mrkdwn' as const, text: `:gear: ${text}` }],
    },
  ];
}
