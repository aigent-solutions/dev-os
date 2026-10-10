// Generates the PDF fixtures for 03-upload-extraction.md §12 without any PDF library: minimal, valid PDF 1.4
// files with Helvetica text. Re-run with `npx tsx tests/fixtures/pdfs/generate.ts` (output is committed).
import { randomBytes } from 'node:crypto';
import { DEMO_NDA_PAGES } from './demo-nda';
import { buildPdf, type Page } from './pdf-builder';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const CLAUSES = [
  'The Receiving Party shall keep all Confidential Information strictly confidential and shall not disclose it to any third party.',
  'Confidential Information may be used solely for the purpose of evaluating a potential business relationship between the parties.',
  'This Agreement is governed by the laws of England and Wales and the courts of England have exclusive jurisdiction.',
  'Either party may terminate this Agreement on thirty days written notice to the other party at its registered address.',
];
const textPage = (n: number, lines = 24): Page => ({
  lines: [`Page ${n} of the agreement.`, ...Array.from({ length: lines }, (_, i) => CLAUSES[(i + n) % CLAUSES.length]!)],
});
/** A dense page of varied words: ~1,000+ tokens, so 20 of them exceed the 15,000-token limit. */
const densePage = (n: number): Page => ({
  lines: Array.from({ length: 60 }, (_, i) => `Clause ${n}.${i + 1}: obligations, warranties, indemnities, ${randomBytes(12).toString('hex')} and limitations apply mutatis.`),
});




const OUT = path.join(__dirname);
const write = (name: string, buf: Buffer) => writeFileSync(path.join(OUT, name), buf);

write('nda-3p.pdf', buildPdf([textPage(1), textPage(2), textPage(3)]));
write('blank-middle-3p.pdf', buildPdf([textPage(1), { blank: true }, textPage(3)]));
write('scanned-1p.pdf', buildPdf([{ scanned: true }]));
write('encrypted.pdf', buildPdf([textPage(1)], { encrypt: true }));
write('corrupt.pdf', Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(2048)]));
write('msa-21p.pdf', buildPdf(Array.from({ length: 21 }, (_, i) => textPage(i + 1, 6))));
write('too-long-20p.pdf', buildPdf(Array.from({ length: 20 }, (_, i) => densePage(i + 1))));
write('demo-nda-4p.pdf', buildPdf(DEMO_NDA_PAGES.map((lines) => ({ lines }))));
write('not-a-pdf.pdf', Buffer.from('This is a plain text file with a .pdf extension.\n'.repeat(20)));
console.log('PDF fixtures written to', OUT);
