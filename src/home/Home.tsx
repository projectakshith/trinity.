'use client';

import Link from 'next/link';
import { config } from '@/config';
import { greeting } from '@/lib/format';
import { useMounted } from '@/lib/useMounted';
import { askTool, tools } from '@/tools/registry';
import type { Ask } from '@/tools/types';
import { Composer } from '@/ui/Composer';
import { Icon } from '@/ui/Icon';
import { TopBar } from '@/shell/TopBar';

const noAsk: Ask = { placeholder: 'No tools connected', submit: () => undefined };

export function Home() {
  const mounted = useMounted();
  const ask = askTool?.useAsk?.() ?? noAsk;

  return (
    <div className="view">
      <TopBar />
      <div className="scroll">
        <div className="column home">
          <h1 className="greeting">
            {mounted ? greeting() : 'Hello'}, <em>{config.ownerName}</em>.
          </h1>
          <Composer placeholder={ask.placeholder} toolLabel={askTool?.name} autoFocus onSubmit={ask.submit} />

          <section className="home-section">
            <h2>Your tools</h2>
            <div className="tool-grid">
              {tools.map((tool) => (
                <Link key={tool.id} href={tool.href} className="tool-card">
                  <div className="tool-icon">
                    <Icon name={tool.icon} size={18} />
                  </div>
                  <div>
                    <div className="tool-name">{tool.name}</div>
                    <div className="tool-desc">{tool.description}</div>
                  </div>
                  {tool.Status ? <tool.Status /> : null}
                </Link>
              ))}
            </div>
          </section>

          {tools.map((tool) => (tool.HomeSection ? <tool.HomeSection key={tool.id} /> : null))}
        </div>
      </div>
    </div>
  );
}
