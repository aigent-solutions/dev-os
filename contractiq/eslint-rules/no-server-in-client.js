'use strict';

const path = require('node:path');

/**
 * local/no-server-in-client (00-foundation.md §6.12)
 *
 * Files that start with the 'use client' directive must not import server-only modules:
 * openai, pdf-parse, @/lib/env, @/lib/supabase/admin, @/lib/server-guard, or anything under @/server/.
 * This is the build-time protection for modules that use the runtime `server-guard`
 * (the `server-only` package can't be used there because Netlify functions and evals load them).
 * Type-only imports are allowed: they are erased at compile time.
 */
const FORBIDDEN_EXACT = ['@/lib/env', '@/lib/supabase/admin', '@/lib/server-guard'];
const FORBIDDEN_PACKAGES = ['openai', 'pdf-parse'];
const FORBIDDEN_PREFIXES = ['@/server/'];

function isClientFile(program) {
  for (const node of program.body) {
    if (node.type !== 'ExpressionStatement' || typeof node.directive !== 'string') return false;
    if (node.directive === 'use client') return true;
  }
  return false;
}

/** Turns a relative import into its '@/…' form so one rule covers both styles. */
function normalise(source, filename) {
  if (!source.startsWith('.')) return source;
  const abs = path.resolve(path.dirname(filename), source);
  const srcRoot = abs.lastIndexOf(`${path.sep}src${path.sep}`);
  if (srcRoot === -1) return source;
  const rel = abs.slice(srcRoot + 5).split(path.sep).join('/');
  return '@/' + rel.replace(/\.(ts|tsx|js|mjs)$/, '').replace(/\/index$/, '');
}

function forbidden(source) {
  if (FORBIDDEN_EXACT.includes(source)) return true;
  if (FORBIDDEN_PACKAGES.some((p) => source === p || source.startsWith(p + '/'))) return true;
  return FORBIDDEN_PREFIXES.some((p) => source.startsWith(p));
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: "Disallow server-only imports in 'use client' files" },
    schema: [],
    messages: {
      serverImport:
        "'{{source}}' is server-only and cannot be imported from a 'use client' file. " +
        'Fetch the data through an API route or a Server Component instead.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    let client = false;

    function check(node, rawSource, typeOnly) {
      if (!client || typeOnly || typeof rawSource !== 'string') return;
      const source = normalise(rawSource, filename);
      if (forbidden(source)) context.report({ node, messageId: 'serverImport', data: { source: rawSource } });
    }

    return {
      Program(node) {
        client = isClientFile(node);
      },
      ImportDeclaration(node) {
        const typeOnly =
          node.importKind === 'type' ||
          (node.specifiers.length > 0 && node.specifiers.every((s) => s.importKind === 'type'));
        check(node, node.source.value, typeOnly);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value, node.exportKind === 'type');
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value, node.exportKind === 'type');
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node, node.source.value, false);
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0]?.type === 'Literal') {
          check(node, node.arguments[0].value, false);
        }
      },
    };
  },
};
