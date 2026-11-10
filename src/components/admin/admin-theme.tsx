'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const storageKey = 'admin-theme';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => undefined });
export const useAdminTheme = () => useContext(ThemeContext);

/** Runs before first paint (see the protected layout) so a dark admin never flashes white. */
export const themeBootScript = `try{if(localStorage.getItem('${storageKey}')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

/**
 * Dark mode is only for the admin area: the `dark` class goes on <html> while an admin page is
 * mounted (so portalled menus and dialogs inherit it) and is removed again on leaving.
 */
export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const root = document.documentElement;
    const timer = setTimeout(() => setTheme(root.classList.contains('dark') ? 'dark' : 'light'), 0);
    return () => { clearTimeout(timer); root.classList.remove('dark'); };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try { localStorage.setItem(storageKey, next); } catch { /* storage unavailable */ }
    setTheme(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
