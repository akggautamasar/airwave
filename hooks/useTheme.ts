'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'airwave:theme';

/** Matches the browser chrome to the surface behind it. */
const BAR_COLOR: Record<Theme, string> = {
  dark: '#0B1014',
  light: '#E9EDF0',
};

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BAR_COLOR[theme]);
}

/**
 * Theme lives on the html element, set by an inline script in the layout before
 * first paint so there is no flash of the wrong palette. This hook reads that
 * attribute rather than guessing a default.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing can refuse storage; the theme still applies for now.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
