import '@/lib/server-guard'; // loaded by the retention Netlify function
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createAdminSupabase } from '@/lib/supabase/admin';

export type CheckResult = 'ok' | 'warning';

const PAGE = 1000; // PostgREST returns ≤ 1,000 rows per request
const BUDGET_WARN_AT = 0.8;
const CORRECTION_MIN_TERMS = 50; // no alerts from tiny samples
const CORRECTION_WARN_ABOVE = 0.12;

/** Month-to-date OpenAI spend vs OPENAI_MONTHLY_BUDGET_USD; warns at ≥ 80% (12 §6.6). Throws on DB error. */
export async function runCostBudgetCheck(now = new Date()): Promise<CheckResult> {
  const admin = createAdminSupabase();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('ai_usage_logs')
      .select('cost_usd')
      .gte('created_at', monthStart)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    total += data.reduce((s, r) => s + Number(r.cost_usd), 0);
    if (data.length < PAGE) break;
  }
  const budget = serverEnv.OPENAI_MONTHLY_BUDGET_USD;
  const pct = budget > 0 ? total / budget : 0;
  const month = monthStart.slice(0, 7);
  if (pct >= BUDGET_WARN_AT) {
    logger.warn('COST_BUDGET_WARNING', { month, month_to_date_usd: +total.toFixed(2), budget_usd: budget, pct_of_budget: Math.round(pct * 100) });
    return 'warning';
  }
  logger.info('COST_BUDGET_OK', { month, month_to_date_usd: +total.toFixed(2), budget_usd: budget });
  return 'ok';
}

/** 7-day term correction rate (the view computes the window); warns above 12% once ≥ 50 terms were extracted (12 §6.6). Throws on DB error. */
export async function runCorrectionRateCheck(): Promise<CheckResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from('term_correction_rate_7d').select('edited_terms_7d, extracted_terms_7d, correction_rate').single();
  if (error) throw error;
  const extracted = Number(data.extracted_terms_7d ?? 0);
  const rate = data.correction_rate == null ? 0 : Number(data.correction_rate);
  if (extracted >= CORRECTION_MIN_TERMS && rate > CORRECTION_WARN_ABOVE) {
    logger.warn('PROMPT_REVIEW_NEEDED', {
      correction_rate: +rate.toFixed(4),
      edited_terms_7d: Number(data.edited_terms_7d ?? 0),
      extracted_terms_7d: extracted,
      prompt_version: serverEnv.EXTRACTION_PROMPT_VERSION,
    });
    return 'warning';
  }
  return 'ok';
}
