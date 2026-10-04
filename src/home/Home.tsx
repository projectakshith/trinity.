'use client';

import Link from 'next/link';
import { config } from '@/config';
import { greeting, todayLabel } from '@/lib/format';
import { useMounted } from '@/lib/useMounted';
import { useShell } from '@/shell/AppShell';
import { askTool, tools } from '@/tools/registry';
import type { Ask } from '@/tools/types';
import { Composer } from '@/ui/Composer';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';

const noAsk: Ask = { placeholder: 'No tools connected', submit: () => undefined };

export function Home() {
  const mounted = useMounted();
  const { openPalette } = useShell();
  const ask = askTool?.useAsk?.() ?? noAsk;

  return (
    <div className="view">
      <div className="scroll home-scroll">
        <div className="column home">
          <header className="home-head">
            <p className="eyebrow">{mounted ? todayLabel() : ' '}</p>
            <button type="button" className="search-hint" onClick={openPalette}>
              <Icon name="search" size={14} />
              <span>Search</span>
              <kbd>⌘K</kbd>
            </button>
          </header>

          <h1 className="greeting">
            {mounted ? greeting() : 'Hello'},<br />
            <em>{config.ownerName}.</em>
          </h1>

          <Composer
            placeholder={ask.placeholder}
            autoFocus
            onSubmit={ask.submit}
            leading={
              askTool ? (
                <span className="tool-chip">
                  <span className="tool-glyph">{glyphs.bullet}</span>
                  {askTool.name}
                </span>
              ) : null
            }
          />

          <div className="home-grid">
            <div className="home-main">{tools.map((tool) => (tool.HomeSection ? <tool.HomeSection key={tool.id} /> : null))}</div>

            <aside className="home-aside">
              <h2 className="eyebrow">Tools</h2>
              <div className="tool-list">
                {tools.map((tool) => (
                  <Link key={tool.id} href={tool.href} className="tool-card">
                    <div className="tool-icon">
                      <Icon name={tool.icon} size={17} />
                    </div>
                    <div className="tool-body">
                      <div className="tool-name">{tool.name}</div>
                      <div className="tool-desc">{tool.description}</div>
                      {tool.Status ? <tool.Status /> : null}
                    </div>
                    <Icon name="arrowRight" size={14} className="tool-go" />
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
