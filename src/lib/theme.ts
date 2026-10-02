/*
 * Light/dark theme: follows the system until the user picks one. The .dark class on <html> drives the CSS tokens.
 */

import { useCallback, useEffect, useState } from 'react';
import { THEME_KEY as KEY } from './themeScript';

export function useTheme(): { isDark: boolean; toggle: () => void } {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const media = matchMedia('(prefers-color-scheme: dark)');
    const follow = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(KEY)) return;
      } catch {
        /* No storage: always follow the system. */
      }
      document.documentElement.classList.toggle('dark', e.matches);
      setIsDark(e.matches);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    setIsDark(next);
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      /* Choice just won't persist. */
    }
  }, []);

  return { isDark, toggle };
}
