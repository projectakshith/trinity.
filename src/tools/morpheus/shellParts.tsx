'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { bucketOf, type SessionBucket } from '@/lib/format';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import type { Ask } from '../types';
import { MORPHEUS_HREF, sessionHref, useMorpheus } from './state';

const BUCKETS: SessionBucket[] = ['Today', 'Yesterday', 'This week', 'Earlier'];
const HOME_RECENTS = 3;

export function NavDot() {
  const { link, connection } = useMorpheus();
  const [glyph, tone] = !link
    ? [glyphs.bulletOpen, 'off']
    : connection === 'open'
      ? [glyphs.bullet, 'on']
      : connection === 'unauthorized'
        ? [glyphs.error, 'bad']
        : [glyphs.running, 'wait'];
  return <span className={`status-glyph ${tone}`}>{glyph}</span>;
}

export function CardStatus() {
  const { link, connection, sessions } = useMorpheus();
  const running = sessions.filter((s) => s.status === 'running').length;
  let text = 'Connected';
  if (!link) text = 'Not connected';
  else if (connection === 'unauthorized') text = 'Token rejected';
  else if (connection !== 'open') text = 'Reconnecting…';
  else if (running > 0) text = `Connected · ${running} running`;
  return <span className={`tool-status${link && connection === 'open' ? ' on' : ''}`}>{text}</span>;
}

export function SidebarRecents() {
  const { sessions } = useMorpheus();
  const pathname = usePathname();
  const active = useSearchParams().get('s');
  const onMorpheus = pathname.startsWith(MORPHEUS_HREF.replace(/\/$/u, ''));

  const groups = useMemo(() => {
    const now = Date.now();
    const map = new Map<SessionBucket, typeof sessions>();
    for (const s of sessions) {
      const bucket = bucketOf(s.updatedAt, now);
      map.set(bucket, [...(map.get(bucket) ?? []), s]);
    }
    return BUCKETS.filter((b) => map.has(b)).map((b) => [b, map.get(b) ?? []] as const);
  }, [sessions]);

  return (
    <div className="recents">
      {groups.map(([bucket, items]) => (
        <section key={bucket}>
          <h3>{bucket}</h3>
          {items.map((s) => (
            <Link key={s.id} href={sessionHref(s.id)} className={`recent${onMorpheus && s.id === active ? ' active' : ''}`}>
              <span className="recent-title">{s.title}</span>
              {s.status === 'running' ? <span className="running-glyph">{glyphs.running}</span> : null}
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}

export function HomeRecents() {
  const { sessions } = useMorpheus();
  const recent = sessions.slice(0, HOME_RECENTS);
  if (recent.length === 0) return null;
  return (
    <section className="home-section">
      <h2>Pick up where you left off</h2>
      <div className="recent-list">
        {recent.map((s) => (
          <Link key={s.id} href={sessionHref(s.id)} className="recent-row">
            <span className="recent-row-title">{s.title}</span>
            <span className="faint">{s.status === 'running' ? 'Running' : `${s.turnCount} ${s.turnCount === 1 ? 'turn' : 'turns'}`}</span>
            <Icon name="chevronRight" size={15} className="faint" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function useMorpheusAsk(): Ask {
  const { link, ask } = useMorpheus();
  return {
    placeholder: link ? 'Ask Morpheus to build, fix or explain something…' : 'Connect Morpheus to start a task…',
    submit: ask,
  };
}

export function useMorpheusNewChat(): () => void {
  const { createSession, openSession, link } = useMorpheus();
  const router = useRouter();
  return useCallback(() => {
    if (!link) {
      router.push(MORPHEUS_HREF);
      return;
    }
    void createSession().then((id) => id && openSession(id));
  }, [createSession, openSession, link, router]);
}
