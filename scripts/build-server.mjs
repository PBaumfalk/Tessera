// Bündelt den Server mit esbuild. Native Pakete bleiben extern.
import { build } from 'esbuild';
const common = {
  bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true, logLevel: 'info',
  external: ['@resvg/resvg-js', 'zxing-wasm', 'pdfkit', 'svg-to-pdfkit', 'fsevents'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};
await build({ ...common, entryPoints: ['src/server/main.ts'], outfile: 'dist/server.js' });
await build({ ...common, entryPoints: ['src/server/cli.ts'], outfile: 'dist/cli.js' });
