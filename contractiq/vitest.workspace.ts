import { defineWorkspace } from 'vitest/config';

// Coverage gates live in the npm scripts (test:unit → src/lib ≥ 85%, test:integration → src/server ≥ 85%):
// Vitest 2 ignores `coverage` inside a workspace project, so a setting here would silently do nothing.

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      environment: 'node',
      environmentMatchGlobs: [
        ['tests/unit/components/**', 'jsdom'],
        ['tests/unit/hooks/**', 'jsdom'],
      ],
      setupFiles: ['tests/setup/env.ts', 'tests/setup/jest-dom.ts', 'tests/setup/msw.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['tests/setup/env.ts', 'tests/setup/msw.ts', 'tests/setup/next-headers-mock.ts', 'tests/setup/integration-each.ts'],
      globalSetup: ['tests/setup/integration-global.ts'],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      testTimeout: 30_000,
    },
  },
]);
