/*
 * Text formatting shared across Trinity, mirroring the Morpheus TUI's wording.
 */

import { relativePath, type ThreadStep } from 'morpheus/client';

export function fmtTokens(n: number | undefined): string {
  if (!n) return '0k';
  return n >= 100_000 ? `${Math.round(n / 1000)}k` : `${(n / 1000).toFixed(1)}k`;
}

export function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function arg(step: ThreadStep, key: string): string {
  const value = step.args?.[key];
  return typeof value === 'string' ? value : '';
}

/* Live label for what the agent is doing right now ("reading: src/app.ts (1.2s)..."). */
export function actionLabel(step: ThreadStep | undefined, cwd: string, now: number): string {
  if (!step) return 'cooking...';
  const ms = step.isRunning && step.startTime ? now - step.startTime : (step.durationMs ?? 0);
  const t = ` (${fmtSeconds(ms)})...`;
  if (step.type === 'thinking') return `thinking rn${t}`;
  const path = (key: string) => clip(relativePath(arg(step, key), cwd), 32);
  switch (step.name) {
    case 'grep_code':
      return arg(step, 'pattern') ? `searching for "${clip(arg(step, 'pattern'), 24)}"${t}` : `searching code${t}`;
    case 'read_file':
      return arg(step, 'filePath') ? `reading: ${path('filePath')}${t}` : `reading file${t}`;
    case 'write_file':
      return arg(step, 'filePath') ? `writing: ${path('filePath')}${t}` : `writing file${t}`;
    case 'edit_file':
      return arg(step, 'filePath') ? `editing: ${path('filePath')}${t}` : `editing file${t}`;
    case 'bash':
      return arg(step, 'command') ? `running: ${clip(arg(step, 'command').trim(), 32)}${t}` : `running command${t}`;
    case 'list_dir':
      return arg(step, 'dirPath') ? `looking through: ${path('dirPath')}${t}` : `checking folders${t}`;
    case 'outline_code':
      return arg(step, 'filePath') ? `peeking at: ${path('filePath')}${t}` : `inspecting code${t}`;
    case 'http_request':
      return arg(step, 'url') ? `pinging: ${clip(arg(step, 'url'), 32)}${t}` : `pinging link${t}`;
    case 'uplink_search':
      return arg(step, 'query') ? `uplink search: ${clip(arg(step, 'query'), 32)}${t}` : `searching web${t}`;
    case 'uplink_browse':
      return `uplink ${arg(step, 'action') || 'browse'}: ${clip(arg(step, 'url') || '…', 28)}${t}`;
    case 'load_skill':
      return arg(step, 'name') ? `loading: ${arg(step, 'name')}${t}` : `loading skill${t}`;
    case 'record_finding':
      return arg(step, 'topic') ? `noting down: ${clip(arg(step, 'topic'), 28)}${t}` : `taking notes${t}`;
    default:
      return `running: ${step.name || 'something'}${t}`;
  }
}
