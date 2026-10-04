'use client';

import Link from 'next/link';
import { timeAgo } from '@/lib/format';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { BRIEF_HREF, useBrief, type Insight } from './state';

const TONES = {
  1: { glyph: glyphs.bullet, label: 'Needs you', tone: 'ember' },
  2: { glyph: glyphs.bulletOpen, label: 'Worth a look', tone: 'blue' },
  3: { glyph: glyphs.chip, label: 'FYI', tone: 'muted' },
} as const;

const SOURCES: Record<string, string> = { whatsapp: 'WhatsApp', mail: 'Mail', calendar: 'Calendar', trinity: 'Trinity' };

export function sourceName(source: string): string {
  return SOURCES[source] ?? source;
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
        <span className="brief-more">
          Open brief <Icon name="arrowRight" size={13} />
        </span>
      </Link>
    </section>
  );
}
