'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import { bucketOf, projectName, timeAgo, type SessionBucket } from '@/lib/format';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { sessionGlyph, useMorpheusNewSession } from './shellParts';
import { sessionHref, useMorpheus } from './state';

const BUCKETS: SessionBucket[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

export function SessionsPanel({ onHide }: { onHide: () => void }) {
  const { sessions, connection, unlink } = useMorpheus();
  const active = useSearchParams().get('s');
  const newSession = useMorpheusNewSession();
  const [query, setQuery] = useState('');
  const onQuery = useCallback((e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), []);

  const groups = useMemo(() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    const list = q ? sessions.filter((s) => `${s.title} ${s.cwd}`.toLowerCase().includes(q)) : sessions;
    const map = new Map<SessionBucket, typeof sessions>();
    for (const s of list) {
      const bucket = bucketOf(s.updatedAt, now);
      map.set(bucket, [...(map.get(bucket) ?? []), s]);
    }
    return BUCKETS.filter((b) => map.has(b)).map((b) => [b, map.get(b) ?? []] as const);
  }, [sessions, query]);

  const now = Date.now();

  return (
    <aside className="sessions-panel">
      <div className="panel-head">
        <span className="panel-title">Morpheus</span>
        <button type="button" className="ghost-btn" onClick={onHide} aria-label="hide sessions">
          <Icon name="sidebar" size={16} />
        </button>
      </div>

      <button type="button" className="new-session" onClick={newSession} disabled={connection !== 'open'}>
        <Icon name="plus" size={15} />
        New session
      </button>

      <label className="panel-search">
        <Icon name="search" size={14} />
        <input value={query} onChange={onQuery} placeholder="Filter sessions" spellCheck={false} autoCapitalize="off" />
      </label>

      <div className="panel-list">
        {groups.length === 0 ? <p className="panel-empty">{query ? 'No sessions match.' : 'No sessions yet.'}</p> : null}
        {groups.map(([bucket, items]) => (
          <section key={bucket}>
            <h3 className="eyebrow">{bucket}</h3>
            {items.map((s) => {
              const [glyph, tone] = sessionGlyph(s.status);
              return (
                <Link key={s.id} href={sessionHref(s.id)} className={`panel-row${s.id === active ? ' active' : ''}`}>
                  <span className={`glyph panel-glyph ${tone}`}>{glyph}</span>
                  <span className="panel-text">
                    <span className="panel-row-title">{s.title}</span>
                    <span className="panel-row-meta">
                      {projectName(s.cwd)} · {s.status === 'running' ? 'running' : timeAgo(s.updatedAt, now)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </section>
        ))}
      </div>

      <div className="panel-foot">
        <span className={`glyph ${connection === 'open' ? 'on' : connection === 'unauthorized' ? 'bad' : 'wait'}`}>
          {connection === 'open' ? glyphs.bullet : connection === 'unauthorized' ? glyphs.error : glyphs.running}
        </span>
        <span className="panel-conn">{connection === 'open' ? 'Connected' : connection === 'unauthorized' ? 'Token rejected' : 'Reconnecting…'}</span>
        <button type="button" className="ghost-btn" onClick={unlink} aria-label="disconnect morpheus" title="Disconnect">
          <Icon name="logout" size={14} />
        </button>
      </div>
    </aside>
  );
}
