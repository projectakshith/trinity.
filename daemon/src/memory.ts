import { createHash } from 'node:crypto';
import { readJson, writeJson } from './config';
import type { SourceItem, SourceId, Upcoming } from './types';

export type UpcomingStatus = Upcoming['status'];

const FILE = 'memory.json';
const UNDATED_DAYS = 7;
const MAX_ITEMS = 60;

export interface RawUpcoming {
  ref?: string;
  what?: string;
  when?: string;
  whenText?: string;
  who?: string;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
}

export function parseWhen(when: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/u.exec(when.trim());
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function load(): Upcoming[] {
  return (readJson<{ items: Upcoming[] }>(FILE)?.items ?? []).map((i) => ({ ...i, status: i.status ?? 'pending' }));
}

function alive(item: Upcoming, now: Date): boolean {
  const date = parseWhen(item.when);
  if (date) {
    const end = new Date(date);
    if (item.when.length <= 10) end.setHours(23, 59, 59, 999);
    else end.setHours(end.getHours() + 2);
    return end.getTime() >= now.getTime();
  }
  return now.getTime() - item.addedAt < UNDATED_DAYS * 86_400_000;
}

function sortKey(item: Upcoming): number {
  return parseWhen(item.when)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function everything(now: Date): Upcoming[] {
  const items = load();
  const live = items.filter((i) => alive(i, now)).sort((a, b) => sortKey(a) - sortKey(b));
  if (live.length !== items.length) writeJson(FILE, { items: live });
  return live;
}

export function upcoming(now = new Date()): Upcoming[] {
  return everything(now).filter((i) => i.status !== 'skip');
}

export function setStatus(id: string, status: UpcomingStatus): boolean {
  const items = load();
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  item.status = status;
  item.updatedAt = Date.now();
  writeJson(FILE, { items });
  return true;
}

export function remember(raw: RawUpcoming[], sources: Map<string, SourceItem>, now = new Date()): Upcoming[] {
  const items = everything(now);
  for (const r of raw) {
    const what = String(r.what ?? '').trim().slice(0, 90);
    if (!what) continue;
    const when = String(r.when ?? '').trim();
    const date = parseWhen(when);
    if (when && !date) continue;
    const ref = String(r.ref ?? '').replace(/[[\]\s]/gu, '');
    const source = sources.get(ref);
    const key = norm(what);
    const existing = items.find((i) => norm(i.what) === key || (i.ref && i.ref === ref && i.when === when && when));
    if (existing) {
      if (date && existing.when !== when) {
        existing.when = when;
        existing.whenText = String(r.whenText ?? '').slice(0, 60);
        existing.updatedAt = now.getTime();
        if (existing.status === 'remind') existing.status = 'pending';
      }
      continue;
    }
    const entry: Upcoming = {
      id: createHash('sha256').update(`${key}|${when}`).digest('hex').slice(0, 12),
      what,
      when: date ? when.slice(0, when.length > 10 ? 16 : 10) : '',
      whenText: String(r.whenText ?? '').slice(0, 60),
      who: String(r.who ?? '').trim() || source?.from,
      chat: source?.from,
      source: (source?.source ?? 'whatsapp') as SourceId,
      ref: source?.ref,
      status: 'pending',
      addedAt: now.getTime(),
      updatedAt: now.getTime(),
    };
    if (alive(entry, now)) items.push(entry);
  }
  const next = items.sort((a, b) => sortKey(a) - sortKey(b)).slice(0, MAX_ITEMS);
  writeJson(FILE, { items: next });
  return next.filter((i) => i.status !== 'skip');
}
