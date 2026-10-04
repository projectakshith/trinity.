'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { tools } from '@/tools/registry';
import { glyphs } from '@/ui/glyphs';
import { Icon, type IconName } from '@/ui/Icon';
import { useShell } from './AppShell';

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/$/u, '') : path;
}

function RailLink({ href, icon, label, active, badge }: { href: string; icon: IconName; label: string; active: boolean; badge?: ReactNode }) {
  return (
    <Link href={href} className={`rail-item${active ? ' active' : ''}`} data-tip={label} aria-label={label}>
      <Icon name={icon} size={18} />
      <span className="rail-label">{label}</span>
      {badge ? <span className="rail-badge">{badge}</span> : null}
    </Link>
  );
}

export function Rail() {
  const { isDark, toggleTheme, openPalette } = useShell();
  const pathname = trimSlash(usePathname());

  return (
    <nav className="rail">
      <Link href="/" className="rail-mark" aria-label="Trinity">
        {glyphs.bullet}
      </Link>

      <div className="rail-items">
        <RailLink href="/" icon="home" label="Home" active={pathname === '/'} />
        {tools.map((tool) => (
          <RailLink
            key={tool.id}
            href={tool.href}
            icon={tool.icon}
            label={tool.name}
            active={pathname.startsWith(trimSlash(tool.href))}
            badge={tool.Badge ? <tool.Badge /> : null}
          />
        ))}
        <button type="button" className="rail-item rail-search" onClick={openPalette} data-tip="Search ⌘K" aria-label="search">
          <Icon name="search" size={18} />
          <span className="rail-label">Search</span>
        </button>
      </div>

      <div className="rail-foot">
        <button type="button" className="rail-item" onClick={toggleTheme} data-tip={isDark ? 'Light mode' : 'Dark mode'} aria-label="toggle theme">
          <Icon name={isDark ? 'sun' : 'moon'} size={17} />
        </button>
      </div>
    </nav>
  );
}
