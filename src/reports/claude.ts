// Transport layer for Claude API calls.
//
// Two modes:
//   1. Proxy mode (default) — calls the Vercel Serverless Function at /api/*,
//      which holds the Anthropic key server-side. Safe for shared deployment.
//   2. BYO-key mode — user pastes their own key into Settings. Requests go
//      directly to api.anthropic.com from the browser. The key lives in
//      localStorage under 'babylog_claude_key'.
//
// Both modes share the same request/response shape so callers don't care.

import type { ReportStats } from './stats';
import type { AIContent } from './template';
import { REPORT_SYSTEM_PROMPT, REPORT_TOOL_SCHEMA, CHAT_SYSTEM_PROMPT, INSIGHT_SYSTEM_PROMPT } from './prompts';

const BYO_KEY_STORAGE = 'babylog_claude_key';
const MODEL = 'claude-opus-4-6';

export function getByoKey(): string | null {
  try {
    const k = localStorage.getItem(BYO_KEY_STORAGE);
    return k && k.startsWith('sk-ant-') ? k : null;
  } catch {
    return null;
  }
}

export function setByoKey(key: string | null) {
  try {
    if (key && key.startsWith('sk-ant-')) {
      localStorage.setItem(BYO_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(BYO_KEY_STORAGE);
    }
  } catch {
    /* ignore */
  }
}

export function hasByoKey(): boolean {
  return getByoKey() !== null;
}

export type ClaudeErrorCode = 'network' | 'auth' | 'rate_limit' | 'server' | 'parse' | 'proxy_missing';

export class ClaudeError extends Error {
  code: ClaudeErrorCode;
  constructor(message: string, code: ClaudeErrorCode) {
    super(message);
    this.code = code;
  }
}

// ─── Report generation ───────────────────────────────────────────────────────

export async function generateReportProse(stats: ReportStats): Promise<AIContent> {
  const byoKey = getByoKey();
  const userPayload = {
    baby: stats.baby,
    range: stats.range,
    totals: stats.totals,
    feedingModel: stats.feedingModel,
    perDay: stats.days.map(d => ({
      date: d.dateISO,
      dayOfLife: d.dayOfLife,
      feedCount: d.feedCount,
      totalVolumeMl: Math.round(d.totalVolumeMl),
      wetCount: d.wetCount,
      stoolCount: d.stoolCount,
      pumpCount: d.pumpCount,
      stoolDescriptions: d.stoolDescriptions,
    })),
    wetDiaperThresholds: stats.wetDiaperThresholds,
    stoolProgression: stats.stoolProgression,
    volumeTrend: stats.volumeTrend,
    pumpSessions: stats.pumpSessions,
  };

  const requestBody = {
    model: MODEL,
    max_tokens: 2000,
    system: REPORT_SYSTEM_PROMPT,
    tools: [REPORT_TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'submit_report_prose' },
    messages: [
      {
        role: 'user',
        content: `Generate the feeding report prose for the following data. Return only via the submit_report_prose tool.\n\n<data>\n${JSON.stringify(userPayload, null, 2)}\n</data>`,
      },
    ],
  };

  const response = byoKey
    ? await callAnthropicDirect(byoKey, requestBody)
    : await callProxy('/api/report', requestBody);

  const toolUse = response.content?.find((c: { type: string }) => c.type === 'tool_use');
  if (!toolUse || toolUse.name !== 'submit_report_prose' || !toolUse.input) {
    throw new ClaudeError('Claude did not return structured report content', 'parse');
  }
  const input = toolUse.input as AIContent;
  // Defensive validation: Claude is instructed to always return exactly 6 items
  // but if it doesn't we'd render a broken grid. Pad/trim to 6.
  if (!Array.isArray(input.assessment) || input.assessment.length !== 6) {
    throw new ClaudeError('Claude returned malformed assessment array', 'parse');
  }
  return input;
}

// ─── Chat (Phase 2) ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  babySummary: {
    name: string;
    ageDays: number;
    feedingModel: string;
    last7Days: {
      feedsPerDay: number[];
      volumePerDayMl: number[];
      wetPerDay: number[];
      stoolPerDay: number[];
      pumpsPerDay: number[];
    };
  };
  recentEvents: {
    // Last 48 hours of raw events for granular questions
    feeds: { ts: number; type: string; ml: number | null; notes: string | null }[];
    diapers: { ts: number; type: string; color: string | null; consistency: string | null }[];
    pumps: { ts: number; side: string; ml: number | null }[];
  };
}

export async function* chatStream(
  history: ChatMessage[],
  context: ChatContext,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const byoKey = getByoKey();
  const systemWithContext = `${CHAT_SYSTEM_PROMPT}\n\n<baby_context>\n${JSON.stringify(context, null, 2)}\n</baby_context>`;

  const requestBody = {
    model: MODEL,
    max_tokens: 1024,
    stream: true,
    system: systemWithContext,
    messages: history.map(m => ({ role: m.role, content: m.content })),
  };

  const url = byoKey ? 'https://api.anthropic.com/v1/messages' : '/api/chat';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (byoKey) {
    headers['x-api-key'] = byoKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!res.ok) throw await errorFromResponse(res);
  if (!res.body) throw new ClaudeError('No response body', 'network');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield event.delta.text as string;
        }
      } catch {
        /* ignore malformed SSE line */
      }
    }
  }
}

// ─── Daily insight (one-shot, non-streaming) ─────────────────────────────────

export async function generateDailyInsight(context: ChatContext): Promise<string> {
  const byoKey = getByoKey();
  const requestBody = {
    model: MODEL,
    max_tokens: 200,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Produce one short observation for this baby based on the context.\n\n<baby_context>\n${JSON.stringify(context, null, 2)}\n</baby_context>`,
      },
    ],
  };

  const response = byoKey
    ? await callAnthropicDirect(byoKey, requestBody)
    : await callProxy('/api/insight', requestBody);

  const textBlock = response.content?.find((c: { type: string; text?: string }) => c.type === 'text');
  if (!textBlock?.text) {
    throw new ClaudeError('Claude did not return any insight text', 'parse');
  }
  return textBlock.text.trim();
}

// ─── Internals ───────────────────────────────────────────────────────────────

interface AnthropicResponse {
  content: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  stop_reason?: string;
}

async function callAnthropicDirect(apiKey: string, body: unknown): Promise<AnthropicResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFromResponse(res);
  return res.json();
}

async function callProxy(path: string, body: unknown): Promise<AnthropicResponse> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ClaudeError('Could not reach the Claude proxy. Check your connection or paste your own API key in Settings.', 'network');
  }
  if (res.status === 404) {
    throw new ClaudeError('The Claude proxy is not deployed. Paste your own API key in Settings to continue.', 'proxy_missing');
  }
  if (!res.ok) throw await errorFromResponse(res);
  return res.json();
}

async function errorFromResponse(res: Response): Promise<ClaudeError> {
  let message = `Claude request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data?.error?.message) message = data.error.message;
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) return new ClaudeError(message, 'auth');
  if (res.status === 429) return new ClaudeError(message, 'rate_limit');
  if (res.status >= 500) return new ClaudeError(message, 'server');
  return new ClaudeError(message, 'network');
}
