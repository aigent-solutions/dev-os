// Only allowlisted files may import the service-role client (README §3.9, 00-foundation.md §6.12).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ALLOWLIST = [
  'src/server/services/contracts.service.ts',
  'src/server/services/extraction.service.ts',
  'src/server/services/chat.service.ts',
  'src/server/services/account.service.ts',
  'src/server/services/retention.service.ts',
  'src/server/services/usage.service.ts',
  'src/lib/ai/usage-log.ts',
  'src/lib/api/rate-limit.ts',
  'src/lib/security/auditLog.ts', // writes the server-only audit_events table (Stage 7)
];
const ALLOWED_PREFIXES = ['netlify/functions/', 'tests/', 'evals/'];
const IMPORT = /from\s+['"](@\/lib\/supabase\/admin|[./]+(?:lib\/)?supabase\/admin)['"]|import\(['"]@\/lib\/supabase\/admin['"]\)/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = ['src', 'netlify', 'tests', 'evals'].flatMap(walk).filter((f) => /\.(ts|tsx|mts)$/.test(f));
const offenders = files
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => f !== 'src/lib/supabase/admin.ts')
  .filter((f) => IMPORT.test(readFileSync(f, 'utf8')))
  .filter((f) => !ALLOWLIST.includes(f) && !ALLOWED_PREFIXES.some((p) => f.startsWith(p)));

if (offenders.length) {
  console.error('check-admin-imports: service-role client imported outside the allowlist:\n' + offenders.join('\n'));
  process.exit(1);
}
console.log('check-admin-imports: ok');
