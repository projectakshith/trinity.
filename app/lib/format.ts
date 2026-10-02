/*
 * Human wording for times, token counts and agent steps.
 */

import { relativePath, type ThreadStep } from 'morpheus/client';

export function fmtTokens(n: number | undefined): string {
  if (!n) return '0';
  if (n < 1000) return String(n);
  return n >= 100_000 ? `${Math.round(n / 1000)}k` : `${(n / 1000).toFixed(1)}k`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export type SessionBucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier';

export function bucketOf(ts: number, now = Date.now()): SessionBucket {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t = startOfToday.getTime();
  if (ts >= t) return 'Today';
  if (ts >= t - 86_400_000) return 'Yesterday';
  if (ts >= t - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

function arg(step: ThreadStep, key: string): string {
  const value = step.args?.[key];
  return typeof value === 'string' ? value : '';
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* What the agent is doing right now, as a short present-tense phrase. */
export function liveLabel(step: ThreadStep | undefined, cwd: string): string {
  if (!step || step.type === 'thinking') return 'Thinking';
  const file = (key: string) => clip(relativePath(arg(step, key), cwd) || 'a file');
  switch (step.name) {
    case 'read_file':
      return `Reading ${file('filePath')}`;
    case 'edit_file':
      return `Editing ${file('filePath')}`;
    case 'write_file':
      return `Writing ${file('filePath')}`;
    case 'list_dir':
      return `Looking through ${file('dirPath')}`;
    case 'grep_code':
      return `Searching for “${clip(arg(step, 'pattern'), 32)}”`;
    case 'outline_code':
      return `Skimming ${file('filePath')}`;
    case 'bash':
      return `Running ${clip(arg(step, 'command').trim(), 40)}`;
    case 'http_request':
      return `Fetching ${clip(arg(step, 'url'), 40)}`;
    case 'uplink_search':
      return `Searching the web for “${clip(arg(step, 'query'), 32)}”`;
    case 'uplink_browse':
      return `Browsing ${clip(arg(step, 'url') || 'the web', 40)}`;
    case 'load_skill':
      return `Loading ${arg(step, 'name') || 'a skill'}`;
    case 'record_finding':
      return 'Taking notes';
    default:
      return `Using ${step.name ?? 'a tool'}`;
  }
}
