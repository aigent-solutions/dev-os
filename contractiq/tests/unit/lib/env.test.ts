import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

// 00-foundation.md §12.2 — env validation at boot.
const BASE = {
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(30),
  OPENAI_API_KEY: 'sk-test',
  OPENAI_PRICE_INPUT_PER_MTOK: '2.5',
  OPENAI_PRICE_OUTPUT_PER_MTOK: '10',
  OPENAI_USER_HASH_SALT: 's'.repeat(32),
  OPENAI_MONTHLY_BUDGET_USD: '400',
  INTERNAL_FUNCTION_SECRET: 'i'.repeat(32),
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};
const parse = (over: Record<string, string | undefined> = {}) => parseServerEnv({ ...BASE, ...over } as unknown as NodeJS.ProcessEnv);

describe('parseServerEnv', () => {
  it('applies the defaults', () => {
    expect(parse()).toMatchObject({
      PROCESSING_MODE: 'background',
      PROCESSING_SYNC_FALLBACK: true,
      SYNC_PROCESSING_BUDGET_MS: 24_000,
      CHAT_MAX_INPUT_TOKENS: 100_000,
      OPENAI_EXTRACTION_MODEL: 'gpt-4o',
      OPENAI_CHAT_MODEL: 'gpt-4o',
      EXTRACTION_PROMPT_VERSION: 'extraction-v1.0',
      CHAT_PROMPT_VERSION: 'chat-v1.0',
    });
  });

  it('empty strings fall back to the defaults (blank lines copied from .env.example)', () => {
    expect(parse({ PROCESSING_MODE: '', PROCESSING_SYNC_FALLBACK: '', SYNC_PROCESSING_BUDGET_MS: '' })).toMatchObject({
      PROCESSING_MODE: 'background',
      PROCESSING_SYNC_FALLBACK: true,
      SYNC_PROCESSING_BUDGET_MS: 24_000,
    });
  });

  it('PROCESSING_SYNC_FALLBACK=false is honoured', () => {
    expect(parse({ PROCESSING_SYNC_FALLBACK: 'false' }).PROCESSING_SYNC_FALLBACK).toBe(false);
  });

  it.each([
    ['PROCESSING_MODE=foo', { PROCESSING_MODE: 'foo' }, /PROCESSING_MODE/],
    ['a salt under 32 characters', { OPENAI_USER_HASH_SALT: 'short' }, /OPENAI_USER_HASH_SALT/],
    ['an unknown prompt version', { EXTRACTION_PROMPT_VERSION: 'extraction-v9' }, /EXTRACTION_PROMPT_VERSION/],
    ['a key without sk-', { OPENAI_API_KEY: 'nope' }, /OPENAI_API_KEY/],
    ['a missing service-role key', { SUPABASE_SERVICE_ROLE_KEY: undefined }, /SUPABASE_SERVICE_ROLE_KEY/],
    ['a budget below the sync minimum', { SYNC_PROCESSING_BUDGET_MS: '1000' }, /SYNC_PROCESSING_BUDGET_MS/],
  ])('%s throws, naming the variable', (_l, over, re) => {
    expect(() => parse(over)).toThrow(re);
  });

  it('SITE_URL prefers URL (Netlify) over NEXT_PUBLIC_APP_URL, and strips a trailing slash', () => {
    expect(parse({ URL: 'https://contractiq.netlify.app/' }).SITE_URL).toBe('https://contractiq.netlify.app');
    expect(parse({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000/' }).SITE_URL).toBe('http://localhost:3000');
  });
});
