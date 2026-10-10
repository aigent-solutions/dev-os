// Copies the PDF.js worker that matches react-pdf's pdfjs-dist into public/ (00-foundation.md §6.1).
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const reactPdfDir = path.dirname(require.resolve('react-pdf/package.json'));
const pdfjsPkg = require.resolve('pdfjs-dist/package.json', { paths: [reactPdfDir] });
const source = path.join(path.dirname(pdfjsPkg), 'build', 'pdf.worker.min.mjs');
const target = path.join(process.cwd(), 'public', 'pdf.worker.min.mjs');

if (!existsSync(source)) {
  console.error(`copy-pdf-worker: worker not found at ${source}`);
  process.exit(1);
}
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copy-pdf-worker: pdfjs-dist ${require(pdfjsPkg).version} → public/pdf.worker.min.mjs`);
