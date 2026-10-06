'use client';

import { useState, type FormEvent } from 'react';
import { timeAgo } from '@/lib/format';
import { TopBar } from '@/shell/TopBar';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { InsightItem, sourceName, UpcomingList } from './parts';
import { useBrief } from './state';

export function BriefPage() {
  const { link, connect, digest, error, refreshing, reachable, refresh } = useBrief();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [token, setToken] = useState('');
  const showConnection = !link || editing;
  const saveConnection = (event: FormEvent) => {
    event.preventDefault();
    if (!/^https:\/\/[^/]+/u.test(address.trim()) || !token.trim()) return;
    connect({ url: address, token });
    setEditing(false);
  };
  const groups = [1, 2, 3].map((p) => ({ p, items: digest?.insights.filter((i) => i.priority === p) ?? [] })).filter((g) => g.items.length);
  const names = { 1: 'Needs you', 2: 'Worth a look', 3: 'For your information' } as Record<number, string>;

  return (
    <div className="view">
      <TopBar title="Brief">
        <button type="button" className="ghost-btn" onClick={() => { setAddress(link?.url ?? ''); setToken(link?.token ?? ''); setEditing((value) => !value); }}>
          Connection
        </button>
        <button type="button" className="ghost-btn" onClick={refresh} disabled={refreshing || !reachable}>
          <Icon name="clock" size={14} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </TopBar>
      <div className="scroll">
        <div className="column brief">
          {showConnection ? (
            <form className="connect-card" onSubmit={saveConnection}>
              <p className="eyebrow">Your Mac</p>
              <h1 className="serif-title">Connect Trinity Core</h1>
              <p className="lede">Enter the private HTTPS address for trinityd and the token in ~/.trinity/daemon.json.</p>
              <div className="connect-fields">
                <label className="field"><span>Address</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="https://mac.your-tailnet.ts.net" spellCheck={false} autoCapitalize="off" inputMode="url" /></label>
                <label className="field"><span>Token</span><input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" /></label>
                <button type="submit" className="primary-btn" disabled={!/^https:\/\/[^/]+/u.test(address.trim()) || !token.trim()}>Connect</button>
              </div>
            </form>
          ) : null}
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

          {digest?.upcoming?.length ? (
            <section className="brief-group">
              <h2 className="eyebrow">
                Coming up <span className="count">{digest.upcoming.length}</span>
              </h2>
              <UpcomingList items={digest.upcoming} />
            </section>
          ) : null}

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
