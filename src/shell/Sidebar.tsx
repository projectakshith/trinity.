'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useCallback, type MouseEvent } from 'react';
import { useTheme } from '@/lib/theme';
import { chatTool, tools } from '@/tools/registry';
import { Icon } from '@/ui/Icon';

const noop = () => undefined;

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/$/u, '') : path;
}

export function Sidebar({ onCollapse, onNavigate }: { onCollapse: () => void; onNavigate: () => void }) {
  const { isDark, toggle } = useTheme();
  const pathname = trimSlash(usePathname());
  const newChat = chatTool?.useNewChat?.() ?? noop;
  const onClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if ((e.target as Element).closest('a')) onNavigate();
    },
    [onNavigate]
  );

  return (
    <aside className="sidebar" onClick={onClick}>
      <div className="sidebar-head">
        <span className="wordmark">Trinity</span>
        <button type="button" className="ghost-btn" onClick={onCollapse} aria-label="hide sidebar">
          <Icon name="panel" size={17} />
        </button>
      </div>

      {chatTool ? (
        <button type="button" className="new-chat" onClick={newChat}>
          <Icon name="plus" size={16} />
          New chat
        </button>
      ) : null}

      <nav className="nav">
        <Link href="/" className={`nav-item${pathname === '/' ? ' active' : ''}`}>
          <Icon name="home" size={16} />
          <span>Home</span>
        </Link>
        {tools.map((tool) => (
          <Link key={tool.id} href={tool.href} className={`nav-item${pathname === trimSlash(tool.href) ? ' active' : ''}`}>
            <Icon name={tool.icon} size={16} />
            <span>{tool.name}</span>
            {tool.NavBadge ? <tool.NavBadge /> : null}
          </Link>
        ))}
      </nav>

      <div className="sidebar-sections">
        <Suspense fallback={null}>{tools.map((tool) => (tool.SidebarSection ? <tool.SidebarSection key={tool.id} /> : null))}</Suspense>
      </div>

      <div className="sidebar-foot">
        <button type="button" className="ghost-btn" onClick={toggle} aria-label="toggle theme">
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  );
}
