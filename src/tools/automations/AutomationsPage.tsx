'use client';

import { TopBar } from '@/shell/TopBar';
import { glyphs } from '@/ui/glyphs';

const PLANNED = [
  { title: 'Wake brief', detail: 'What finished overnight, what broke, and where you stopped. Ready when you open the laptop.' },
  { title: 'Daily close', detail: 'Writes your log, pushes WIP branches and queues tomorrow’s first task.' },
  { title: 'Overnight shift', detail: 'Queue tasks before bed. Morpheus works through them while you sleep.' },
  { title: 'Repo radar', detail: 'Dirty, unpushed and failing repos across your machine on one board.' },
];

export function AutomationsPage() {
  return (
    <div className="view">
      <TopBar title="Automations" />
      <div className="scroll">
        <div className="column automations">
          <span className="session-mark">{glyphs.chip}</span>
          <p className="eyebrow">Coming soon</p>
          <h1 className="serif-title">Routines that run on their own</h1>
          <p className="lede">On a schedule or when something happens, then they report back here.</p>
          <div className="planned">
            {PLANNED.map((p) => (
              <div key={p.title} className="planned-item">
                <span className="glyph planned-glyph">{glyphs.bulletOpen}</span>
                <div>
                  <div className="planned-title">{p.title}</div>
                  <div className="planned-detail">{p.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
