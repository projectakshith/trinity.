'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { tools } from '@/tools/registry';
import { Sidebar } from './Sidebar';

const NARROW = '(max-width: 860px)';

interface Shell {
  showSidebar: () => void;
}

const ShellContext = createContext<Shell>({ showSidebar: () => undefined });

export function useShell(): Shell {
  return useContext(ShellContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setDrawerOpen(false), [pathname]);

  const showSidebar = useCallback(() => {
    if (window.matchMedia(NARROW).matches) setDrawerOpen(true);
    else setSidebarHidden(false);
  }, []);
  const hideSidebar = useCallback(() => {
    if (window.matchMedia(NARROW).matches) setDrawerOpen(false);
    else setSidebarHidden(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const shell = useMemo(() => ({ showSidebar }), [showSidebar]);

  let content = (
    <div className={`app${sidebarHidden ? ' sidebar-hidden' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
      <Sidebar onCollapse={hideSidebar} onNavigate={closeDrawer} />
      {drawerOpen ? <button type="button" className="scrim" aria-label="close sidebar" onClick={closeDrawer} /> : null}
      <main className="main">{children}</main>
    </div>
  );
  for (const tool of [...tools].reverse()) {
    if (tool.Provider) content = <tool.Provider>{content}</tool.Provider>;
  }

  return <ShellContext.Provider value={shell}>{content}</ShellContext.Provider>;
}
