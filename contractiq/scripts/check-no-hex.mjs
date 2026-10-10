// Fails if a src/**/*.ts(x) file contains a hex colour or a Tailwind arbitrary colour (00-foundation.md §6.12).
// Hex values may only live in src/styles/tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const ARBITRARY_COLOUR = /(bg|text|border|fill|stroke|ring)-\[#/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const offenders = [];
for (const file of walk('src').filter((f) => /\.(ts|tsx)$/.test(f))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (HEX.test(line) || ARBITRARY_COLOUR.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
}

if (offenders.length) {
  console.error('check-no-hex: use design tokens (tailwind.config.ts) instead of raw colours:\n' + offenders.join('\n'));
  process.exit(1);
}
console.log('check-no-hex: ok');
