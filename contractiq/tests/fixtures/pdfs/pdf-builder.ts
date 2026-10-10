// Minimal PDF 1.4 writer (Helvetica text, no PDF library). Used by generate.ts and by E2E specs that need a
// one-off PDF (e.g. a unique token so an OpenAI mock override applies to that test only).
import { randomBytes } from 'node:crypto';

export type Page = { lines: string[] } | { scanned: true } | { blank: true };

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function content(page: Page): string {
  if ('scanned' in page) return '0.85 g 50 80 495 680 re f 0.6 g 80 600 300 40 re f'; // shapes only: no text layer
  if ('blank' in page) return '';
  return `BT /F1 10 Tf 12 TL 50 770 Td ${page.lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
}

/** Serialises objects with a correct xref table. `encrypt` adds a Standard security handler that rejects the empty password. */
export function buildPdf(pages: Page[], opts: { encrypt?: boolean } = {}): Buffer {
  const objs: string[] = [];
  const add = (body: string) => objs.push(body) && objs.length; // returns the object number
  const catalog = add('');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const p of pages) {
    const stream = content(p);
    const contents = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contents} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let encryptRef = '';
  if (opts.encrypt) {
    const hex = (n: number) => randomBytes(n).toString('hex');
    const enc = add(`<< /Filter /Standard /V 2 /R 3 /Length 128 /P -3904 /O <${hex(32)}> /U <${hex(32)}> >>`);
    encryptRef = ` /Encrypt ${enc} 0 R /ID [<${hex(16)}> <${hex(16)}>]`;
  }

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R${encryptRef} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
