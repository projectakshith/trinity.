'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { timeAgo } from '@/lib/format';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { BRIEF_HREF, useBrief, type Insight, type Upcoming } from './state';

const TONES = {
  1: { glyph: glyphs.bullet, label: 'Needs you', tone: 'ember' },
  2: { glyph: glyphs.bulletOpen, label: 'Worth a look', tone: 'blue' },
  3: { glyph: glyphs.chip, label: 'FYI', tone: 'muted' },
} as const;

const SOURCES: Record<string, string> = { whatsapp: 'WhatsApp', mail: 'Mail', calendar: 'Calendar', trinity: 'Trinity' };

export function sourceName(source: string): string {
  return SOURCES[source] ?? source;
}

function parseWhen(when: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/u.exec(when);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)) : null;
}

export function whenLabel(u: Upcoming, now = new Date()): string {
  const date = parseWhen(u.when);
  if (!date) return u.whenText || 'Soon';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  const dayText = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return u.when.length > 10 ? `${dayText} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : dayText;
}

function UpcomingRow({ item }: { item: Upcoming }) {
  const { decide } = useBrief();
  const remind = useCallback(() => decide(item.id, 'remind'), [decide, item.id]);
  const skip = useCallback(() => decide(item.id, 'skip'), [decide, item.id]);
  const reminding = item.status === 'remind';
  return (
    <div className="upcoming-row">
      <span className={`upcoming-when${reminding ? '' : ' pending'}`}>{whenLabel(item)}</span>
      <span className="upcoming-what">
        {item.what}
        {item.who ? <span className="upcoming-who"> · {item.who}</span> : null}
      </span>
      {reminding ? (
        <span className="upcoming-state">{glyphs.bullet} Reminding</span>
      ) : (
        <span className="upcoming-actions">
          <button type="button" className="mini-btn primary" onClick={remind}>
            Remind
          </button>
          <button type="button" className="mini-btn" onClick={skip}>
            Skip
          </button>
        </span>
      )}
    </div>
  );
}

export function UpcomingList({ items }: { items: Upcoming[] }) {
  return (
    <div className="upcoming-list">
      {items.map((u) => (
        <UpcomingRow key={u.id} item={u} />
      ))}
    </div>
  );
}

export function placeOf(insight: Insight): string {
  const chat = insight.chat ?? insight.from;
  const parts = [sourceName(insight.source), chat];
  if (insight.from && insight.from !== chat) parts.push(insight.from);
  return parts.filter(Boolean).join(' · ');
}

export function InsightItem({ insight }: { insight: Insight }) {
  const t = TONES[insight.priority];
  const body = (
    <>
      <span className={`insight-glyph ${t.tone}`}>{t.glyph}</span>
      <span className="insight-text">
        <span className="insight-title">{insight.title}</span>
        <span className="insight-meta">{placeOf(insight)}</span>
        {insight.detail ? <span className="insight-detail">{insight.detail}</span> : null}
      </span>
    </>
  );
  return insight.url ? (
    <a className="insight" href={insight.url} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <div className="insight">{body}</div>
  );
}

export function BriefBadge() {
  const { digest, reachable } = useBrief();
  const urgent = digest?.insights.filter((i) => i.priority === 1).length ?? 0;
  if (!reachable) return <span className="status-glyph bad">{glyphs.error}</span>;
  return urgent ? <span className="status-glyph ember">{glyphs.bullet}</span> : <span className="status-glyph">{glyphs.bulletOpen}</span>;
}

export function BriefStatus() {
  const { digest, reachable } = useBrief();
  const urgent = digest?.insights.filter((i) => i.priority === 1).length ?? 0;
  const text = !reachable ? 'trinityd offline' : urgent ? `${urgent} need${urgent === 1 ? 's' : ''} you` : 'All clear';
  return <span className={`tool-status${reachable ? ' on' : ''}`}>{text}</span>;
}

export function HomeBrief() {
  const { digest, error, reachable } = useBrief();
  if (!reachable) {
    return (
      <section className="home-section">
        <h2 className="eyebrow">Brief</h2>
        <p className="empty-line">{error}</p>
      </section>
    );
  }
  if (!digest) return null;
  const top = digest.insights.filter((i) => i.priority <= 2).slice(0, 3);
  const next = (digest.upcoming ?? []).slice(0, 3);
  return (
    <section className="home-section">
      <h2 className="eyebrow">
        Brief <span className="count">{timeAgo(digest.generatedAt)}</span>
      </h2>
      <Link href={BRIEF_HREF} className="brief-card">
        <p className="brief-headline">{digest.headline}</p>
        {top.length ? (
          <div className="brief-mini">
            {top.map((i) => (
              <span key={i.id} className="brief-mini-row">
                <span className={`insight-glyph ${TONES[i.priority].tone}`}>{TONES[i.priority].glyph}</span>
                <span className="brief-mini-title">{i.title}</span>
              </span>
            ))}
          </div>
        ) : null}
        {next.length ? (
          <div className="brief-mini">
            <span className="eyebrow">Coming up</span>
            {next.map((u) => (
              <span key={u.id} className="brief-mini-row">
                <span className="upcoming-when small">{whenLabel(u)}</span>
                <span className="brief-mini-title">{u.what}</span>
              </span>
            ))}
          </div>
        ) : null}
        <span className="brief-more">
          Open brief <Icon name="arrowRight" size={13} />
        </span>
      </Link>
    </section>
  );
}
