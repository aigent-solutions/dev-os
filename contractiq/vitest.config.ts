import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Shared config. The unit and integration projects are in vitest.workspace.ts
// (Vitest 2 needs a workspace file; 00-foundation.md §12.1 describes the same two projects).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/setup/server-only-stub.ts'),
    },
  },
  esbuild: { jsx: 'automatic' },
});
