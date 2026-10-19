// Prüft alle im E2E-Lauf exportierten Dateien mit unabhängigen Decodern (ZBar, OpenCV)
// und unabhängigen Renderern (Poppler für PDF, librsvg für SVG).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('test-results/exports');
const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
if (fs.existsSync(path.join(dir, 'serie.zip'))) {
  fs.rmSync(path.join(dir, 'serie'), { recursive: true, force: true });
  execSync(`unzip -q -o serie.zip -d serie`, { cwd: dir });
  const csv = fs.readFileSync(path.join(dir, 'serie', 'uebersicht.csv'), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
  for (const line of csv) {
    const [, file, payload] = line.split(';');
    expected[`serie/png/${file}.png`] = payload;
    expected[`serie/svg/${file}.svg`] = payload;
  }
}
execSync(`docker run --rm -v "${dir}:/work" tessera-decoders`, { stdio: 'ignore' });
const results = JSON.parse(fs.readFileSync(path.join(dir, 'decoded.json'), 'utf8'));
let ok = 0;
const failures = [];
for (const [file, payload] of Object.entries(expected)) {
  const r = results[file];
  if (!r) { failures.push(`${file}: nicht gefunden`); continue; }
  const z = r.zbar === payload;
  const o = r.opencv === payload;
  console.log(`${z ? 'ZBar ✓' : 'ZBar ✗'}  ${o ? 'OpenCV ✓' : 'OpenCV ✗'}  ${file}`);
  if (!z) failures.push(`${file}: ZBar las ${JSON.stringify(r.zbar)}`);
  if (z) ok++;
}
console.log(`\n${ok}/${Object.keys(expected).length} Dateien von ZBar korrekt gelesen; OpenCV-Ergebnisse informativ.`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
