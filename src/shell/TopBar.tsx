'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/ui/Icon';
import { useShell } from './AppShell';

export function TopBar({ title, children }: { title?: string; children?: ReactNode }) {
  const { showSidebar } = useShell();
  return (
    <header className="topbar">
      <button type="button" className="ghost-btn menu-btn" onClick={showSidebar} aria-label="show sidebar">
        <Icon name="panel" size={17} />
      </button>
      {title ? <h1 className="topbar-title">{title}</h1> : null}
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
