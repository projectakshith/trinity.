/*
 * Per-view header. The menu button shows when the sidebar is hidden (collapsed or on phones).
 */

import type { ReactNode } from 'react';
import { Icon } from '../lib/icons';

export function TopBar({ title, onMenu, children }: { title?: string; onMenu: () => void; children?: ReactNode }) {
  return (
    <header className="topbar">
      <button type="button" className="ghost-btn menu-btn" onClick={onMenu} aria-label="show sidebar">
        <Icon name="panel" size={17} />
      </button>
      {title ? <h1 className="topbar-title">{title}</h1> : null}
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
