import { relativePath, type ThreadStep } from 'morpheus/client';

function arg(step: ThreadStep, key: string): string {
  const value = step.args?.[key];
  return typeof value === 'string' ? value : '';
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

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
