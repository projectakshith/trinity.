import type { ReactNode } from 'react';

export function TopBar({ title, lead, children }: { title?: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="topbar">
      {lead}
      {title ? <h1 className="topbar-title">{title}</h1> : null}
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
