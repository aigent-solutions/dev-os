import '@/lib/server-guard'; // loaded by Netlify functions and evals (00 §6.12)
import { serverEnv } from '@/lib/env';

/**
 * USD cost of one OpenAI call, 6 dp (matches ai_usage_logs.cost_usd numeric(10,6)).
 * One price pair covers both models while both default to gpt-4o (12 §6.4).
 */
export function calculateCostUsd(promptTokens: number, completionTokens: number): number {
  const cost =
    (promptTokens / 1_000_000) * serverEnv.OPENAI_PRICE_INPUT_PER_MTOK +
    (completionTokens / 1_000_000) * serverEnv.OPENAI_PRICE_OUTPUT_PER_MTOK;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
