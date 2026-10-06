import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SourceItem, SourceResult } from '../types';

const APPLE_EPOCH = 978_307_200;
const MAIL_DIR = join(homedir(), 'Library/Mail');
const ACCOUNTS_DB = join(homedir(), 'Library/Accounts/Accounts4.sqlite');
const CALENDAR_DB = join(homedir(), 'Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb');
const MAIL_DAYS = 2;
const MAX_MAILS = 20;
const MAX_CHARS = 280;
const CALENDAR_HOURS = 36;

function open(path: string): Database {
  return new Database(`file:${path}?mode=ro`, { readonly: true });
}

function clip(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > MAX_CHARS ? `${flat.slice(0, MAX_CHARS - 1)}…` : flat;
}

function mailRoot(): string | null {
  if (!existsSync(MAIL_DIR)) return null;
  const versions = readdirSync(MAIL_DIR).filter((d) => /^V\d+$/u.test(d)).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  return versions.length ? join(MAIL_DIR, versions[0]) : null;
}

function accountEmails(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(ACCOUNTS_DB)) return map;
  const db = open(ACCOUNTS_DB);
  try {
    const rows = db
      .query(`SELECT c.ZIDENTIFIER AS id, COALESCE(NULLIF(c.ZUSERNAME, ''), p.ZUSERNAME) AS email FROM ZACCOUNT c LEFT JOIN ZACCOUNT p ON c.ZPARENTACCOUNT = p.Z_PK`)
      .all() as { id: string | null; email: string | null }[];
    for (const r of rows) if (r.id && r.email?.includes('@')) map.set(r.id, r.email.toLowerCase());
  } finally {
    db.close();
  }
  return map;
}

function header(headers: string, name: string): string {
  return new RegExp(`^${name}:[^\\n]*(?:\\r?\\n[ \\t][^\\n]*)*`, 'imu').exec(headers)?.[0] ?? '';
}

function decode(body: string, headers: string): string {
  const encoding = /:\s*([\w-]+)/u.exec(header(headers, 'content-transfer-encoding'))?.[1]?.toLowerCase();
  if (encoding === 'base64') return Buffer.from(body.replace(/\s+/gu, ''), 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    const bytes = body.replace(/=\r?\n/gu, '').replace(/=([0-9A-F]{2})/giu, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(bytes, 'latin1').toString('utf8');
  }
  return body;
}

function textPart(raw: string): string {
  const split = raw.search(/\r?\n\r?\n/u);
  if (split < 0) return '';
  const headers = raw.slice(0, split);
  const body = raw.slice(split).replace(/^\r?\n\r?\n/u, '');
  const contentType = header(headers, 'content-type');
  const type = /:\s*([^;\s]+)/u.exec(contentType)?.[1]?.toLowerCase() ?? 'text/plain';
  if (type.startsWith('multipart/')) {
    const boundary = /boundary="?([^";\r\n]+)"?/iu.exec(contentType)?.[1];
    if (!boundary) return '';
    const parts = body.split(`--${boundary}`).slice(1);
    const plain = parts.map(textPart).find((t, i) => t && /^content-type:\s*text\/plain/imu.test(parts[i]));
    return plain ?? parts.map(textPart).find(Boolean) ?? '';
  }
  if (type === 'text/plain') return decode(body, headers);
  if (type === 'text/html') {
    return decode(body, headers)
      .replace(/<(style|script)[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/&nbsp;/gu, ' ')
      .replace(/&amp;/gu, '&');
  }
  return '';
}

function readEmlx(path: string): { messageId?: string; text: string } {
  const content = readFileSync(path, 'latin1');
  const start = content.indexOf('\n') + 1;
  const raw = Buffer.from(content.slice(start), 'latin1').toString('utf8');
  const headerEnd = raw.search(/\r?\n\r?\n/u);
  const messageId = /^message-id:\s*<([^>]+)>/imu.exec(raw.slice(0, headerEnd))?.[1];
  return { messageId, text: textPart(raw) };
}

function emlxPaths(dir: string, wanted: Set<number>): Map<number, string> {
  const found = new Map<number, string>();
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { recursive: true }) as string[]) {
    const m = /(?:^|\/)(\d+)(?:\.partial)?\.emlx$/u.exec(entry);
    if (!m) continue;
    const id = Number(m[1]);
    if (wanted.has(id) && (!found.has(id) || !entry.includes('.partial'))) found.set(id, join(dir, entry));
  }
  return found;
}

interface MailRow {
  id: number;
  at: number;
  read: number;
  address: string | null;
  comment: string | null;
  subject: string;
  summary: string | null;
  url: string;
  list: number | null;
  unsubscribe: number | null;
  folders: string | null;
}

export function readAppleMail(skip: Set<string>): SourceResult | null {
  const root = mailRoot();
  if (!root) return null;
  const emails = accountEmails();
  const index = join(root, 'MailData/Envelope Index');
  if (!existsSync(index)) return null;
  let db: Database;
  try {
    db = open(index);
  } catch (err) {
    return { source: 'mail', ok: false, error: `Mail app: ${(err as Error).message}`, items: [] };
  }
  try {
    const since = Math.floor(Date.now() / 1000) - MAIL_DAYS * 86_400;
    const rows = db
      .query(
        `SELECT m.ROWID AS id, m.date_received AS at, m.read AS read, a.address AS address, a.comment AS comment, s.subject AS subject, su.summary AS summary, mb.url AS url, m.list_id_hash AS list, m.unsubscribe_type AS unsubscribe,
           (SELECT group_concat(f.url, '\n') FROM labels lf JOIN mailboxes f ON f.ROWID = lf.mailbox_id WHERE lf.message_id = m.ROWID AND f.url NOT LIKE '%/INBOX' AND instr(f.url, '/%5BGmail%5D') = 0) AS folders
         FROM messages m
         JOIN mailboxes mb ON mb.ROWID = m.mailbox
         JOIN subjects s ON s.ROWID = m.subject
         LEFT JOIN addresses a ON a.ROWID = m.sender
         LEFT JOIN summaries su ON su.ROWID = m.summary
         WHERE m.deleted = 0 AND m.date_received > ?1
           AND (mb.url LIKE '%/INBOX' OR EXISTS (SELECT 1 FROM labels l JOIN mailboxes ib ON ib.ROWID = l.mailbox_id WHERE l.message_id = m.ROWID AND ib.url LIKE '%/INBOX'))
         ORDER BY m.read ASC, m.date_received DESC`
      )
      .all(since) as MailRow[];

    const byAccount = new Map<string, MailRow[]>();
    for (const row of rows) {
      const uuid = /^[a-z]+:\/\/([^/]+)\//u.exec(row.url)?.[1];
      const email = uuid ? emails.get(uuid) : undefined;
      if (!uuid || !email || skip.has(email)) continue;
      const list = byAccount.get(uuid) ?? [];
      if (list.length < MAX_MAILS) list.push(row);
      byAccount.set(uuid, list);
    }
    if (byAccount.size === 0) return null;

    const items: SourceItem[] = [];
    for (const [uuid, list] of byAccount) {
      const email = emails.get(uuid)!;
      const files = emlxPaths(join(root, uuid), new Set(list.filter((r) => !r.summary).map((r) => r.id)));
      for (const row of list) {
        let text = row.summary ?? '';
        let messageId: string | undefined;
        const file = files.get(row.id);
        if (file) {
          try {
            const parsed = readEmlx(file);
            messageId = parsed.messageId;
            if (!text) text = parsed.text;
          } catch {}
        }
        items.push({
          source: 'mail',
          ref: `mail:app:${row.id}`,
          at: row.at * 1000,
          from: row.comment?.trim() || row.address || 'unknown',
          title: `${row.subject || '(no subject)'} (${email})`,
          text: clip(text),
          unread: row.read === 0,
          address: row.address ?? undefined,
          bulk: Boolean(row.list || row.unsubscribe),
          folders: (row.folders ?? '').split('\n').filter(Boolean).map((u) => decodeURIComponent(u.replace(/^[a-z]+:\/\/[^/]+\//u, ''))),
          url: messageId ? `message://%3C${encodeURIComponent(messageId)}%3E` : undefined,
        });
      }
    }
    return { source: 'mail', ok: true, items };
  } catch (err) {
    return { source: 'mail', ok: false, error: `Mail app: ${(err as Error).message}`, items: [] };
  } finally {
    db.close();
  }
}

interface EventRow {
  id: number;
  summary: string | null;
  start: number;
  allDay: number;
  location: string | null;
  store: string;
}

export function readAppleCalendar(skip: Set<string>): SourceResult | null {
  if (!existsSync(CALENDAR_DB)) return null;
  let db: Database;
  try {
    db = open(CALENDAR_DB);
  } catch (err) {
    return { source: 'calendar', ok: false, error: `Calendar app: ${(err as Error).message}`, items: [] };
  }
  try {
    const now = Date.now() / 1000 - APPLE_EPOCH;
    const rows = db
      .query(
        `SELECT DISTINCT ci.ROWID AS id, ci.summary AS summary, oc.occurrence_start_date AS start, ci.all_day AS allDay, l.title AS location, st.name AS store
         FROM OccurrenceCache oc
         JOIN CalendarItem ci ON ci.ROWID = oc.event_id
         JOIN Calendar c ON c.ROWID = ci.calendar_id
         JOIN Store st ON st.ROWID = c.store_id
         LEFT JOIN Location l ON l.ROWID = ci.location_id
         WHERE oc.occurrence_start_date >= ?1 AND oc.occurrence_start_date < ?2 AND st.name LIKE '%@%' AND ci.hidden = 0
         ORDER BY oc.occurrence_start_date`
      )
      .all(now - 3600, now + CALENDAR_HOURS * 3600) as EventRow[];
    const items: SourceItem[] = rows
      .filter((r) => !skip.has(r.store.toLowerCase()))
      .map((r) => {
        const start = new Date((r.start + APPLE_EPOCH) * 1000);
        const when = r.allDay
          ? `${start.toLocaleDateString('en-GB', { weekday: 'short' })} all day`
          : start.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        return {
          source: 'calendar',
          ref: `cal:app:${r.id}:${Math.round(r.start)}`,
          at: start.getTime(),
          from: 'calendar',
          title: `${r.summary ?? '(untitled event)'} (${r.store})`,
          text: [when, r.location].filter(Boolean).join(' · '),
        };
      });
    return items.length || rows.length ? { source: 'calendar', ok: true, items } : null;
  } catch (err) {
    return { source: 'calendar', ok: false, error: `Calendar app: ${(err as Error).message}`, items: [] };
  } finally {
    db.close();
  }
}
