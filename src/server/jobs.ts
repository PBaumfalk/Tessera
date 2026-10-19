// Begrenzt rechenintensive Aufträge (Export, Serien, Scan-Prüfung), damit Weiterleitungen
// und Oberfläche auch unter Last schnell antworten.
import { fail } from './errors';

const MAX_PARALLEL = 2;
const MAX_QUEUE = 20;
let running = 0;
const queue: (() => void)[] = [];
const perUser = new Map<string, number>();

export const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/** Führt fn aus, sobald ein Platz frei ist. exclusive: höchstens ein solcher Auftrag pro Person. */
export async function heavy<T>(userId: string, fn: () => Promise<T>, exclusive = false): Promise<T> {
  if (exclusive) {
    if ((perUser.get(userId) ?? 0) > 0) throw fail(429, 'Es läuft bereits ein Serienexport von dir. Warte, bis er fertig ist.');
    perUser.set(userId, 1);
  }
  try {
    if (running >= MAX_PARALLEL) {
      if (queue.length >= MAX_QUEUE) throw fail(503, 'Tessera ist gerade ausgelastet. Bitte versuche es gleich noch einmal.');
      await new Promise<void>((r) => queue.push(r));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  } finally {
    if (exclusive) perUser.delete(userId);
  }
}

/** Grenzen für Serienexporte: Anzahl und gesamte Pixelmenge. */
export const BATCH_LIMITS = { maxItems: 5000, maxSheetItems: 2000, maxPngSize: 2048, pixelBudget: 2.6e9 };
