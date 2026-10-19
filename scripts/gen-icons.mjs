// Erzeugt src/shared/icons.generated.ts aus simple-icons (Marken, CC0) und lucide (ISC).
import * as si from 'simple-icons';
import * as lucide from 'lucide';
import fs from 'node:fs';

const brands = {
  instagram: 'siInstagram', whatsapp: 'siWhatsapp', facebook: 'siFacebook', x: 'siX', youtube: 'siYoutube',
  tiktok: 'siTiktok', github: 'siGithub', mastodon: 'siMastodon', xing: 'siXing', telegram: 'siTelegram',
  spotify: 'siSpotify', apple: 'siApple', googleplay: 'siGoogleplay', paypal: 'siPaypal', bitcoin: 'siBitcoin',
  threads: 'siThreads', bluesky: 'siBluesky', pinterest: 'siPinterest', snapchat: 'siSnapchat', twitch: 'siTwitch',
  signal: 'siSignal', discord: 'siDiscord',
};
const generic = {
  wifi: 'Wifi', phone: 'Phone', mail: 'Mail', message: 'MessageCircle', pin: 'MapPin', calendar: 'CalendarDays',
  link: 'Link', globe: 'Globe', user: 'UserRound', card: 'Contact', euro: 'Euro', file: 'FileText', download: 'Download',
  star: 'Star', heart: 'Heart', camera: 'Camera', info: 'Info', ticket: 'Ticket', coffee: 'Coffee', book: 'BookOpen',
  scale: 'Scale', building: 'Building2', clock: 'Clock', shield: 'ShieldCheck', play: 'Play', utensils: 'Utensils',
};
const out = {};
for (const [id, key] of Object.entries(brands)) {
  const icon = si[key];
  out[id] = { label: icon.title, kind: 'fill', viewBox: 24, brandColor: '#' + icon.hex, d: [icon.path] };
}
for (const [id, key] of Object.entries(generic)) {
  const node = lucide[key];
  if (!node) throw new Error('missing lucide ' + key);
  const d = [];
  for (const [tag, a] of node) {
    if (tag === 'path') d.push(a.d);
    else if (tag === 'circle') d.push(`M${+a.cx - +a.r} ${a.cy}a${a.r} ${a.r} 0 1 0 ${2 * a.r} 0a${a.r} ${a.r} 0 1 0 ${-2 * a.r} 0`);
    else if (tag === 'rect') {
      const x = +a.x, y = +a.y, w = +a.width, h = +a.height, r = +(a.rx || 0);
      d.push(r ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z` : `M${x} ${y}h${w}v${h}h${-w}z`);
    } else if (tag === 'line') d.push(`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`);
    else if (tag === 'polyline' || tag === 'polygon') d.push('M' + a.points.trim().replace(/\s+/g, ' L') + (tag === 'polygon' ? 'z' : ''));
    else if (tag === 'ellipse') d.push(`M${+a.cx - +a.rx} ${a.cy}a${a.rx} ${a.ry} 0 1 0 ${2 * a.rx} 0a${a.rx} ${a.ry} 0 1 0 ${-2 * a.rx} 0`);
    else throw new Error('unsupported tag ' + tag + ' in ' + key);
  }
  out[id] = { label: key, kind: 'stroke', viewBox: 24, d };
}
fs.writeFileSync('src/shared/icons.generated.ts',
  '// Automatisch erzeugt von scripts/gen-icons.mjs – nicht von Hand bearbeiten.\n' +
  '// Markenzeichen: simple-icons (CC0), allgemeine Symbole: lucide (ISC).\n' +
  'export interface IconDef { label: string; kind: "fill" | "stroke"; viewBox: number; brandColor?: string; d: string[] }\n' +
  'export const ICONS: Record<string, IconDef> = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(Object.keys(out).length, 'icons');
