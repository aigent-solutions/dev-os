// Real-API smoke test: `npm run smoke:openai`. Costs a few cents of real OpenAI spend, so it runs by hand and
// on release tags (eval-release.yml), never on push/PR. Exits 1 if either configured model rejects our request
// parameters or returns nothing usable, printing OpenAI's own code/param/message.
import { assertEvalEnv } from './lib/env-setup';
import { ConfigError, runMain } from './lib/cli';
import { formatSmoke, runOpenAISmoke } from './lib/smoke';
import { createLogger } from '@/lib/logger';

runMain(async () => {
  assertEvalEnv(); // --live (set by the npm script): a real OPENAI_API_KEY is required
  if (process.env.OPENAI_BASE_URL?.trim()) {
    throw new ConfigError('OPENAI_BASE_URL is set: the smoke test must call the real OpenAI API, not a mock', [process.env.OPENAI_BASE_URL]);
  }
  const checks = await runOpenAISmoke({ log: createLogger({ service: 'smoke-openai' }) });
  console.log(`\nOpenAI smoke test\n${formatSmoke(checks)}\n`);
  return checks.every((c) => c.ok) ? 0 : 1;
});
