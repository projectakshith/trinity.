'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import { tools } from '@/tools/registry';
import { Palette } from './Palette';
import { Rail } from './Rail';

interface Shell {
  isDark: boolean;
  toggleTheme: () => void;
  openPalette: () => void;
}

const ShellContext = createContext<Shell>({ isDark: false, toggleTheme: () => undefined, openPalette: () => undefined });

export function useShell(): Shell {
  return useContext(ShellContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isDark, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setPaletteOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const shell = useMemo(() => ({ isDark, toggleTheme: toggle, openPalette }), [isDark, toggle, openPalette]);

  let content = (
    <div className="app">
      <Rail />
      <main className="main">{children}</main>
      {paletteOpen ? <Palette onClose={closePalette} /> : null}
    </div>
  );
  for (const tool of [...tools].reverse()) {
    if (tool.Provider) content = <tool.Provider>{content}</tool.Provider>;
  }

  return <ShellContext.Provider value={shell}>{content}</ShellContext.Provider>;
}
