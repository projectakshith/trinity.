import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { SourceItem, SourceResult } from '../types';

const APPLE_EPOCH = 978_307_200;
const WINDOW_HOURS = 24;
const UNREAD_WINDOW_HOURS = 72;
const MAX_CHATS = 25;
const MAX_MESSAGES = 8;
const MAX_CHARS = 180;

interface ChatRow {
  pk: number;
  name: string | null;
  jid: string | null;
  unread: number | null;
  last: number | null;
  type: number | null;
}

interface MessageRow {
  date: number;
  mine: number;
  text: string;
  sender: string | null;
}

function columns(db: Database, table: string): Set<string> {
  return new Set((db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
}

function clip(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > MAX_CHARS ? `${flat.slice(0, MAX_CHARS - 1)}…` : flat;
}

function clock(appleSeconds: number): string {
  return new Date((appleSeconds + APPLE_EPOCH) * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function readWhatsApp(path: string, ownerName = 'You'): SourceResult {
  if (!existsSync(path)) return { source: 'whatsapp', ok: false, error: 'WhatsApp desktop database not found', items: [] };
  let db: Database;
  try {
    db = new Database(path, { readonly: true });
    db.query('SELECT 1 FROM ZWACHATSESSION LIMIT 1').get();
  } catch (err) {
    const message = (err as Error).message;
    const denied = /authori[sz]ation denied|not permitted|unable to open/iu.test(message);
    return {
      source: 'whatsapp',
      ok: false,
      error: denied ? 'Grant Full Disk Access to the app running trinityd (System Settings › Privacy & Security)' : message,
      items: [],
    };
  }

  try {
    const now = Date.now() / 1000 - APPLE_EPOCH;
    const since = now - WINDOW_HOURS * 3600;
    const unreadSince = now - UNREAD_WINDOW_HOURS * 3600;
    const memberCols = columns(db, 'ZWAGROUPMEMBER');
    const hasPushTable = columns(db, 'ZWAPROFILEPUSHNAME').has('ZPUSHNAME');
    const memberName = ['ZCONTACTNAME', 'ZFIRSTNAME'].filter((c) => memberCols.has(c)).map((c) => `NULLIF(gm.${c}, '')`);
    const sender = `COALESCE(${[...memberName, hasPushTable ? "NULLIF(pn.ZPUSHNAME, '')" : null, "NULLIF(m.ZPUSHNAME, '')", memberCols.has('ZMEMBERJID') ? "'+' || substr(gm.ZMEMBERJID, 1, instr(gm.ZMEMBERJID, '@') - 1)" : null, 'NULL'].filter(Boolean).join(', ')})`;
    const joinMember = memberCols.size
      ? `LEFT JOIN ZWAGROUPMEMBER gm ON gm.Z_PK = m.ZGROUPMEMBER${hasPushTable ? ' LEFT JOIN ZWAPROFILEPUSHNAME pn ON pn.ZJID = gm.ZMEMBERJID' : ''}`
      : '';

    const chats = db
      .query(
        `SELECT Z_PK AS pk, ZPARTNERNAME AS name, ZCONTACTJID AS jid, ZUNREADCOUNT AS unread, ZLASTMESSAGEDATE AS last, ZSESSIONTYPE AS type
         FROM ZWACHATSESSION
         WHERE (ZLASTMESSAGEDATE >= ?1 OR (ZUNREADCOUNT > 0 AND ZLASTMESSAGEDATE >= ?2))
           AND COALESCE(ZCONTACTJID, '') NOT LIKE '%status%'
         ORDER BY ZLASTMESSAGEDATE DESC
         LIMIT ?3`
      )
      .all(since, unreadSince, MAX_CHATS) as ChatRow[];

    const messagesFor = db.query(
      `SELECT m.ZMESSAGEDATE AS date, m.ZISFROMME AS mine, m.ZTEXT AS text, ${sender} AS sender
       FROM ZWAMESSAGE m ${joinMember}
       WHERE m.ZCHATSESSION = ?1 AND m.ZTEXT IS NOT NULL AND m.ZTEXT != '' AND m.ZMESSAGEDATE >= ?2
       ORDER BY m.ZMESSAGEDATE DESC
       LIMIT ?3`
    );

    const items: SourceItem[] = [];
    for (const chat of chats) {
      const floor = (chat.unread ?? 0) > 0 ? unreadSince : since;
      const rows = (messagesFor.all(chat.pk, floor, MAX_MESSAGES) as MessageRow[]).reverse();
      if (rows.length === 0) continue;
      const name = (chat.name ?? chat.jid ?? 'Unknown chat').replace(/[\u200e\u200f]/gu, '').trim();
      const group = chat.type === 1 || (chat.jid ?? '').endsWith('@g.us');
      if (group && (chat.unread ?? 0) === 0) continue;
      if (!group && name === 'You') continue;
      const lines = rows.map((r) => `${clock(r.date)} ${r.mine ? `${ownerName} (you)` : group ? (r.sender ?? 'unknown member') : name}: ${clip(r.text)}`);
      items.push({
        source: 'whatsapp',
        ref: `wa:${chat.pk}`,
        at: ((chat.last ?? rows[rows.length - 1].date) + APPLE_EPOCH) * 1000,
        from: name,
        title: group ? `group "${name}"` : `DM with ${name}`,
        text: lines.join('\n'),
        unread: (chat.unread ?? 0) > 0,
      });
    }
    return { source: 'whatsapp', ok: true, items };
  } catch (err) {
    return { source: 'whatsapp', ok: false, error: `WhatsApp schema read failed: ${(err as Error).message}`, items: [] };
  } finally {
    db.close();
  }
}
