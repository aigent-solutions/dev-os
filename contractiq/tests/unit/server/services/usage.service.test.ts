import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSupabase, filter } from '../../../helpers/fake-supabase';

// 12-rate-limiting-usage.md §12. The unit env budget is $400.
let fake: ReturnType<typeof fakeSupabase>;
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => fake.client }));
const { runCorrectionRateCheck, runCostBudgetCheck } = await import('@/server/services/usage.service');

const logLines = () => [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls].map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

/** ai_usage_logs pages: `rows` cost values served 1,000 at a time via range(). */
function costRows(costs: number[]) {
  fake = fakeSupabase({
    onQuery: (q) => {
      const [, from, to] = filter(q, 'range') as [string, number, number];
      return { data: costs.slice(from, to + 1).map((c) => ({ cost_usd: String(c) })) };
    },
  });
}

describe('runCostBudgetCheck', () => {
  it('MTD $320 of $400 → COST_BUDGET_WARNING at 80%', async () => {
    costRows([320]);
    expect(await runCostBudgetCheck(new Date('2026-10-15T00:00:00Z'))).toBe('warning');
    expect(logLines().find((l) => l.msg === 'COST_BUDGET_WARNING')).toMatchObject({ pct_of_budget: 80, month_to_date_usd: 320, budget_usd: 400, month: '2026-10' });
  });

  it('MTD $319 → COST_BUDGET_OK', async () => {
    costRows([319]);
    expect(await runCostBudgetCheck(new Date('2026-10-15T00:00:00Z'))).toBe('ok');
    expect(logLines().some((l) => l.msg === 'COST_BUDGET_OK')).toBe(true);
  });

  it('sums across pages (2,500 rows) from the start of the UTC month', async () => {
    costRows(Array.from({ length: 2_500 }, () => 0.1)); // $250
    expect(await runCostBudgetCheck(new Date('2026-10-15T00:00:00Z'))).toBe('ok');
    expect(fake.queries).toHaveLength(3);
    expect(filter(fake.queries[0]!, 'gte')).toEqual(['gte', 'created_at', '2026-10-01T00:00:00.000Z']);
    expect(logLines().find((l) => l.msg === 'COST_BUDGET_OK')).toMatchObject({ month_to_date_usd: 250 });
  });
});

describe('runCorrectionRateCheck', () => {
  const view = (extracted: number, rate: number) =>
    (fake = fakeSupabase({ onQuery: () => ({ data: { edited_terms_7d: Math.round(extracted * rate), extracted_terms_7d: extracted, correction_rate: rate } }) }));

  it('13% over 49 terms → no alert (sample too small)', async () => {
    view(49, 0.13);
    expect(await runCorrectionRateCheck()).toBe('ok');
  });

  it('13% over 50 terms → PROMPT_REVIEW_NEEDED', async () => {
    view(50, 0.13);
    expect(await runCorrectionRateCheck()).toBe('warning');
    expect(logLines().find((l) => l.msg === 'PROMPT_REVIEW_NEEDED')).toMatchObject({ correction_rate: 0.13, extracted_terms_7d: 50 });
  });

  it('exactly 12% → ok (the threshold is "above 12%")', async () => {
    view(100, 0.12);
    expect(await runCorrectionRateCheck()).toBe('ok');
  });
});
