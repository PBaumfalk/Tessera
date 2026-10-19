// Berechnet Inhalt, Vorschau und Lesbarkeit des aktuellen Codes.
import { useEffect, useMemo, useState } from 'react';
import { getType, type Issue } from '@shared/content';
import { analyzeDesign, overallStatus, type Check, type CheckStatus } from '@shared/analyze';
import { CapacityError, renderSvg, type RenderMeta } from '@shared/render';
import { shortUrl } from '@shared/links';
import type { Design } from '@shared/design';
import { api } from '../lib/api';
import { useDebounced, useSettings } from '../lib/hooks';
import { loadLabelFonts } from '../lib/fonts';
import { useEditor } from '../lib/editor-store';
import type { VerifyResult } from '../lib/types';

let fontsReady = false;
export function useFontsReady() {
  const [ready, setReady] = useState(fontsReady);
  useEffect(() => {
    if (!fontsReady) void loadLabelFonts().then(() => { fontsReady = true; setReady(true); });
  }, []);
  return ready;
}

export interface QrState {
  payload: string | null;
  /** Inhalt, mit dem die Vorschau gezeichnet wird (bei leerem Formular ein Beispiel) */
  previewPayload: string;
  placeholder: boolean;
  issues: Issue[];
  svg: string | null;
  meta: RenderMeta | null;
  capacityError: boolean;
  checks: Check[];
  verify: VerifyResult | null;
  verifying: boolean;
  status: CheckStatus | 'wait';
  minEc?: 'L' | 'M' | 'Q' | 'H';
  base: string;
}

export function computePayload(type: string, content: Record<string, string | boolean>, kind: 'static' | 'dynamic', slug: string | null, base: string) {
  const t = getType(type);
  const issues = t.validate(content);
  const hasErr = issues.some((i) => i.level === 'error');
  if (kind === 'dynamic') return { payload: slug ? shortUrl(base, slug) : null, issues };
  return { payload: hasErr ? null : t.encode(content), issues };
}

export function useQr(printMm: number): QrState {
  const { type, contents, design, kind, slug } = useEditor();
  const settings = useSettings();
  const fonts = useFontsReady();
  const base = settings.data?.publicBase.url ?? location.origin;
  const content = contents[type] ?? {};
  const t = getType(type);
  const { payload, issues } = useMemo(() => computePayload(type, content, kind, slug, base), [type, content, kind, slug, base]);
  const placeholder = !payload;
  const previewPayload = payload ?? (kind === 'dynamic' ? shortUrl(base, 'beispiel') : t.encode({ ...t.defaults, ...t.example }));

  const rendered = useMemo(() => {
    try {
      const r = renderSvg(previewPayload, design, { minEc: t.minEc, idPrefix: 'ed', title: 'QR-Code-Vorschau' });
      return { svg: r.svg, meta: r.meta, capacityError: false };
    } catch (e) {
      if (e instanceof CapacityError) return { svg: null, meta: null, capacityError: true };
      throw e;
    }
    // fonts als Abhängigkeit: Beschriftung wird nach dem Laden als Pfad gerendert
  }, [previewPayload, design, t.minEc, fonts]);

  // Zu viele Daten: verständlich am Inhalt melden und nichts exportieren lassen
  const bytes = new TextEncoder().encode(previewPayload).length;
  const capIssues: Issue[] = rendered.capacityError && payload
    ? [{ level: 'error', message: `Zu viele Daten für einen QR-Code (${bytes.toLocaleString('de-DE')} Byte, höchstens etwa ${design.logo.kind !== 'none' || design.ec === 'H' ? '1.270' : '2.300'}). Kürze den Inhalt, senke die Fehlerkorrektur oder nutze einen dynamischen Code.` }]
    : [];
  const effectivePayload = rendered.capacityError ? null : payload;

  const checks = useMemo(() => analyzeDesign(design, rendered.meta, { minEc: t.minEc, printMm }), [design, rendered.meta, t.minEc, printMm]);

  // Ergebnis gehört immer zu genau einem Stand (Inhalt + Design); veraltete Ergebnisse zählen nicht
  const [verified, setVerified] = useState<{ key: string; result: VerifyResult | null } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const liveKey = JSON.stringify([effectivePayload, design]);
  const key = useDebounced(liveKey, 450);
  useEffect(() => {
    const [p, d] = JSON.parse(key) as [string | null, Design];
    if (!p) { setVerified(null); return; }
    let alive = true;
    setVerifying(true);
    api.post<VerifyResult>('/api/verify', { payload: p, design: d, minEc: t.minEc })
      .then((r) => { if (alive) setVerified({ key, result: r }); })
      .catch(() => { if (alive) setVerified({ key, result: null }); })
      .finally(() => { if (alive) setVerifying(false); });
    return () => { alive = false; };
  }, [key, t.minEc]);
  const fresh = verified?.key === liveKey;
  const verify = verified?.result ?? null;

  const staticStatus = overallStatus(checks);
  let status: CheckStatus | 'wait';
  if (rendered.capacityError && payload) status = 'fail';
  else if (!payload) status = 'wait';
  else if (staticStatus === 'fail') status = 'fail';
  else if (!fresh) status = 'wait';
  else if (!verify) status = staticStatus; // Prüfdienst nicht erreichbar: nur Regelprüfung
  else if (verify.grade === 'fail') status = 'fail';
  else if (verify.grade === 'fair' || staticStatus === 'warn') status = 'warn';
  else status = 'ok';

  return {
    payload: effectivePayload, previewPayload, placeholder, issues: [...issues, ...capIssues], svg: rendered.svg, meta: rendered.meta, capacityError: rendered.capacityError,
    checks, verify, verifying: verifying || !fresh, status, minEc: t.minEc, base,
  };
}
