import { describe, expect, it } from 'vitest';
import { buildEvalFixture } from '../../fixtures/evals/build';
import { runEval, tempDir } from '../../helpers/run-eval';

// 15-evals.md §12 — the chat groundedness eval in replay mode. The dataset rules require exactly
// 20 off-document + 20 in-document questions (§6.7), so the fixture has 40, not the four §12 mentions.
describe('run-chat-groundedness --replay', () => {
  it('all grounded → pass rates 100% / 100% and exit 0 with --gate', () => {
    const data = tempDir('ciq-eval-data-');
    buildEvalFixture(data);
    const r = runEval('run-chat-groundedness.ts', ['--replay', '--gate', '--data', data]);
    expect(r.code, r.stderr || r.stdout).toBe(0);
    const m = r.summary().metrics;
    expect(m.off_document).toMatchObject({ passed: 20, total: 20, rate: 1 });
    expect(m.in_document).toMatchObject({ passed: 20, total: 20, rate: 1 });
  }, 120_000);

  it('one off-document question answered with content → the gate fails (exit 1)', () => {
    const data = tempDir('ciq-eval-data-');
    buildEvalFixture(data, { tamper: { offDocumentAnswer: true } });
    const r = runEval('run-chat-groundedness.ts', ['--replay', '--gate', '--data', data]);
    expect(r.code).toBe(1);
    expect(r.summary().metrics.off_document).toMatchObject({ passed: 19, total: 20 });
  }, 120_000);
});
