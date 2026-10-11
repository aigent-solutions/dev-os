// Fails the build if pdf.js's worker would be missing from the deployed extract function.
// pdfjs-dist is external, so Next's file trace decides which of its files ship to Netlify; pdf.js
// imports its worker at runtime, which the trace only sees because extract-text.ts imports it by
// literal path. Run after `npm run build`.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TRACE = '.next/server/app/api/contracts/[id]/extract/route.js.nft.json';
const REQUIRED = ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/legacy/build/pdf.worker.mjs'];

if (!existsSync(TRACE)) {
  console.error(`check-pdf-worker-traced: ${TRACE} not found — run \`npm run build\` first.`);
  process.exit(1);
}
const files = JSON.parse(readFileSync(TRACE, 'utf8')).files.map((f) => f.split(path.sep).join('/'));
const missing = REQUIRED.filter((r) => !files.some((f) => f.endsWith(`node_modules/${r}`)));
if (missing.length) {
  console.error(`check-pdf-worker-traced: the extract route's trace is missing ${missing.join(', ')}.\nPDF extraction would fail on Netlify ("Setting up fake worker failed"). See src/lib/pdf/extract-text.ts.`);
  process.exit(1);
}
console.log('check-pdf-worker-traced: ok');
