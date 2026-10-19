import { create } from 'zustand';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'tessera-theme';

function read(): ThemePref {
  try { return (localStorage.getItem(KEY) as ThemePref) || 'system'; } catch { return 'system'; }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const useTheme = create<{ pref: ThemePref; set: (p: ThemePref) => void }>((set) => ({
  pref: read(),
  set: (pref) => {
    try { localStorage.setItem(KEY, pref); } catch { /* privater Modus */ }
    apply(pref);
    set({ pref });
  },
}));

export function initTheme() {
  apply(read());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(useTheme.getState().pref));
}
