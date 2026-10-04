'use client';

import { timeAgo } from '@/lib/format';
import { TopBar } from '@/shell/TopBar';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { InsightItem, sourceName } from './parts';
import { useBrief } from './state';

export function BriefPage() {
  const { digest, error, refreshing, reachable, refresh } = useBrief();
  const groups = [1, 2, 3].map((p) => ({ p, items: digest?.insights.filter((i) => i.priority === p) ?? [] })).filter((g) => g.items.length);
  const names = { 1: 'Needs you', 2: 'Worth a look', 3: 'For your information' } as Record<number, string>;

  return (
    <div className="view">
      <TopBar title="Brief">
        <button type="button" className="ghost-btn" onClick={refresh} disabled={refreshing || !reachable}>
          <Icon name="clock" size={14} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </TopBar>
      <div className="scroll">
        <div className="column brief">
          <p className="eyebrow">{digest ? `Updated ${timeAgo(digest.generatedAt)}` : 'Brief'}</p>
          <h1 className="brief-title">{digest?.headline ?? (reachable ? 'Gathering…' : 'Trinity is offline.')}</h1>
          {error ? <p className="brief-error">{glyphs.error} {error}</p> : null}

          {digest?.summary ? (
            <ul className="brief-summary">
              {digest.summary
                .split('\n')
                .map((l) => l.replace(/^[-•]\s*/u, '').trim())
                .filter(Boolean)
                .map((l) => (
                  <li key={l}>{l}</li>
                ))}
            </ul>
          ) : null}

          {groups.map((g) => (
            <section key={g.p} className="brief-group">
              <h2 className="eyebrow">
                {names[g.p]} <span className="count">{g.items.length}</span>
              </h2>
              <div className="insight-list">
                {g.items.map((i) => (
                  <InsightItem key={i.id} insight={i} />
                ))}
              </div>
            </section>
          ))}

          {digest ? (
            <section className="brief-group">
              <h2 className="eyebrow">Sources</h2>
              <div className="source-row">
                {digest.sources.map((s) => (
                  <span key={s.source} className={`source-chip${s.ok ? ' ok' : ''}`} title={s.error}>
                    <span className="glyph">{s.ok ? glyphs.bullet : glyphs.running}</span>
                    {sourceName(s.source)}
                    <span className="faint">{s.ok ? s.count : 'off'}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
