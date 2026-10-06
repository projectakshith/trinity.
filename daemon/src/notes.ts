import { readJson, writeJson } from './config';

const FILE = 'notes.json';
const MAX_NOTES = 40;

interface Note {
  text: string;
  at: number;
}

function load(): Note[] {
  return readJson<{ items: Note[] }>(FILE)?.items ?? [];
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
}

export function notes(): string[] {
  return load().map((n) => n.text);
}

export function addNote(text: string): void {
  const clean = text.replace(/\s+/gu, ' ').trim().slice(0, 140);
  if (!clean) return;
  const items = load().filter((n) => norm(n.text) !== norm(clean));
  writeJson(FILE, { items: [...items, { text: clean, at: Date.now() }].slice(-MAX_NOTES) });
}
