// Zustand des Editors. Inhalte werden je Typ gemerkt, damit ein Typwechsel nichts verliert.
import { create } from 'zustand';
import { getType, type ContentData } from '@shared/content';
import { DEFAULT_DESIGN, sanitizeDesign, type Design } from '@shared/design';
import type { CodeDetail, CodeEvent } from './types';

const SLUG_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
export function clientSlug(len = 7): string {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => SLUG_ALPHABET[v % SLUG_ALPHABET.length]).join('');
}

export interface EditorMeta {
  enabled: boolean;
  expiresAt: string | null;
  fallbackUrl: string;
  tracking: boolean;
  storeSecrets: boolean;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  note: string;
}

interface EditorState extends EditorMeta {
  id: string | null;
  name: string;
  nameTouched: boolean;
  type: string;
  contents: Record<string, ContentData>;
  design: Design;
  kind: 'static' | 'dynamic';
  slug: string | null;
  savedSlug: string | null;
  shortUrl: string | null;
  linkScope: 'internal' | 'public' | null;
  missingSecrets: string[];
  events: CodeEvent[];
  scanTotal: number;
  dirty: boolean;
  /** Speichern oder Export wurde versucht: Pflichtfeld-Fehler jetzt auch bei leeren Feldern zeigen. */
  attempted: boolean;
  /** Felder, in die schon getippt wurde */
  touched: Record<string, true>;
  past: Design[];
  future: Design[];
  lastPush: number;

  startNew: (type: string, content?: ContentData, design?: Design) => void;
  load: (d: CodeDetail) => void;
  setType: (type: string) => void;
  setField: (key: string, value: string | boolean) => void;
  setContent: (content: ContentData) => void;
  setDesign: (fn: (d: Design) => Design) => void;
  replaceDesign: (d: Design) => void;
  setMeta: (patch: Partial<EditorMeta & { name: string; kind: 'static' | 'dynamic'; slug: string | null }>) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (d: CodeDetail) => void;
}

const blankMeta: EditorMeta = {
  enabled: true, expiresAt: null, fallbackUrl: '', tracking: false, storeSecrets: true, folderId: null, tags: [], favorite: false, note: '',
};

export const useEditor = create<EditorState>((set, get) => ({
  ...blankMeta,
  id: null,
  name: '',
  nameTouched: false,
  type: 'url',
  contents: {},
  design: DEFAULT_DESIGN,
  kind: 'static',
  slug: null,
  savedSlug: null,
  shortUrl: null,
  linkScope: null,
  missingSecrets: [],
  events: [],
  scanTotal: 0,
  dirty: false,
  attempted: false,
  touched: {},
  past: [],
  future: [],
  lastPush: 0,

  startNew: (type, content, design) => set({
    ...blankMeta,
    id: null, name: '', nameTouched: false, type, kind: 'static', slug: null, savedSlug: null, shortUrl: null, linkScope: null,
    contents: { [type]: { ...getType(type).defaults, ...(content ?? {}) } },
    design: design ?? DEFAULT_DESIGN, missingSecrets: [], events: [], scanTotal: 0, dirty: false, attempted: false, touched: {}, past: [], future: [],
  }),

  load: (d) => set({
    id: d.id, name: d.name, nameTouched: true, type: d.type, contents: { [d.type]: d.content }, design: sanitizeDesign(d.design),
    kind: d.kind, slug: d.slug, savedSlug: d.slug, shortUrl: d.shortUrl, linkScope: d.linkScope,
    enabled: d.enabled, expiresAt: d.expiresAt, fallbackUrl: d.fallbackUrl ?? '', tracking: d.tracking, storeSecrets: d.storeSecrets,
    folderId: d.folderId, tags: d.tags, favorite: d.favorite, note: d.note, missingSecrets: d.missingSecrets, events: d.events,
    scanTotal: d.scanTotal, dirty: false, attempted: true, touched: {}, past: [], future: [],
  }),

  markSaved: (d) => set({
    id: d.id, slug: d.slug, savedSlug: d.slug, shortUrl: d.shortUrl, linkScope: d.linkScope, events: d.events,
    missingSecrets: d.missingSecrets, scanTotal: d.scanTotal, dirty: false, name: d.name, nameTouched: true,
  }),

  setType: (type) => {
    const s = get();
    const t = getType(type);
    const kind = s.kind === 'dynamic' && !t.dynamic && !s.savedSlug ? 'static' : s.kind;
    set({ type, kind, contents: { ...s.contents, [type]: s.contents[type] ?? { ...t.defaults } }, dirty: true });
  },

  setField: (key, value) => {
    const s = get();
    set({ contents: { ...s.contents, [s.type]: { ...(s.contents[s.type] ?? {}), [key]: value } }, dirty: true, touched: { ...s.touched, [key]: true } });
  },

  setContent: (content) => {
    const s = get();
    set({ contents: { ...s.contents, [s.type]: content }, dirty: true });
  },

  setDesign: (fn) => {
    const s = get();
    const next = sanitizeDesign(fn(s.design));
    const t = Date.now();
    // Schnelle Folgeänderungen (Schieberegler) werden zu einem Schritt zusammengefasst
    const push = t - s.lastPush > 500;
    set({
      design: next, dirty: true, future: [],
      past: push ? [...s.past.slice(-49), s.design] : s.past,
      lastPush: t,
    });
  },

  replaceDesign: (d) => {
    const s = get();
    set({ design: sanitizeDesign(d), dirty: true, past: [...s.past.slice(-49), s.design], future: [], lastPush: 0 });
  },

  setMeta: (patch) => set({ ...patch, dirty: true, ...(patch.name !== undefined ? { nameTouched: true } : {}) }),

  undo: () => {
    const s = get();
    if (!s.past.length) return;
    set({ design: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.design, ...s.future], dirty: true, lastPush: 0 });
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    set({ design: s.future[0], future: s.future.slice(1), past: [...s.past, s.design], dirty: true, lastPush: 0 });
  },
}));
