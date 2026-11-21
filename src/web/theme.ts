export type Theme = 'system' | 'dark' | 'light';

const STORAGE_KEY = 'career_strike_theme';

export function getStoredTheme(): Theme {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'dark' || val === 'light' || val === 'system') return val;
  } catch {
    // Ignore storage access restrictions
  }
  return 'system';
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore
  }

  const root = document.documentElement;
  root.classList.remove('dark', 'light');

  if (theme === 'dark') {
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
  } else {
    // system: remove explicit classes and data-theme
    root.removeAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    }
  }
}
