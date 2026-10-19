// Lädt die Beschriftungsschriften für die Vektorvorschau (identisch mit dem Server-Export).
import opentype from 'opentype.js';
import { FONTS } from '@shared/design';
import { registerFont } from '@shared/text';

let loading: Promise<void> | null = null;
export function loadLabelFonts(): Promise<void> {
  loading ??= Promise.all(
    FONTS.map(async (f) => {
      const res = await fetch(`/fonts/${f.file}`);
      if (!res.ok) return;
      registerFont(f.id, opentype.parse(await res.arrayBuffer()));
    }),
  ).then(() => undefined, () => undefined);
  return loading;
}
