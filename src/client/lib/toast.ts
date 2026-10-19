import { create } from 'zustand';

export interface Toast { id: number; message: string; tone: 'info' | 'error'; action?: { label: string; run: () => void } }
let n = 0;
export const useToasts = create<{ list: Toast[]; dismiss: (id: number) => void }>((set) => ({
  list: [],
  dismiss: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));

export function toast(message: string, opts: { tone?: 'info' | 'error'; action?: Toast['action']; ms?: number } = {}) {
  const id = ++n;
  useToasts.setState((s) => ({ list: [...s.list.slice(-2), { id, message, tone: opts.tone ?? 'info', action: opts.action }] }));
  setTimeout(() => useToasts.getState().dismiss(id), opts.ms ?? (opts.action ? 6000 : 3200));
}

export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error', ms: 5000 });
