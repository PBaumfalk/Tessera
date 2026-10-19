// Jede Testdatei bekommt ein eigenes, leeres Datenverzeichnis.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-test-'));
process.env.DATA_DIR = dir;
process.env.LOG_LEVEL = 'silent';
process.env.STATIC_DIR = path.join(dir, 'no-static');
