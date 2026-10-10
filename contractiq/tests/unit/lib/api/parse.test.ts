import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '@/lib/api/errors';
import { flattenSearchParams, IdParamsSchema, parseBody, parseParams, parseParamsOr404, parseQuery } from '@/lib/api/parse';

// 00-foundation.md §12.2.
const thrown = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected a throw');
};
const Schema = z.object({ name: z.string().min(2), age: z.number().int() }).strict();

describe('parseBody', () => {
  it('invalid JSON → 400 with a _form detail', async () => {
    const e = await thrown(() => parseBody(new Request('http://x/', { method: 'POST', body: '{not json' }), Schema));
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.details).toEqual({ _form: 'Body must be valid JSON' });
  });

  it('Zod field errors → details keyed by field', async () => {
    const e = await thrown(() => parseBody(new Request('http://x/', { method: 'POST', body: JSON.stringify({ name: 'a', age: 1.5 }) }), Schema));
    expect(e.status).toBe(400);
    expect(Object.keys(e.details!).sort()).toEqual(['age', 'name']);
  });

  it('unknown keys on a strict schema → _form', async () => {
    const e = await thrown(() => parseBody(new Request('http://x/', { method: 'POST', body: JSON.stringify({ name: 'ab', age: 1, plan: 'pro' }) }), Schema));
    expect(e.details?._form).toMatch(/Unrecognized key/);
  });

  it('valid body → parsed data', async () => {
    expect(await parseBody(new Request('http://x/', { method: 'POST', body: JSON.stringify({ name: 'ab', age: 3 }) }), Schema)).toEqual({ name: 'ab', age: 3 });
  });
});

describe('route params', () => {
  it('parseParamsOr404: a malformed id → 404, so nothing about ids leaks', async () => {
    const e = await thrown(() => parseParamsOr404({ id: 'not-a-uuid' }, IdParamsSchema));
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
  });

  it('parseParams: a malformed id → 400 field error', async () => {
    const e = await thrown(() => parseParams({ id: '123' }, IdParamsSchema));
    expect(e.status).toBe(400);
    expect(e.details).toHaveProperty('id');
  });

  it('valid uuid passes both', () => {
    const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    expect(parseParamsOr404({ id }, IdParamsSchema)).toEqual({ id });
    expect(parseParams({ id }, IdParamsSchema)).toEqual({ id });
  });
});

describe('query', () => {
  it('parseQuery validates search params', async () => {
    const Q = z.object({ page: z.coerce.number().int().min(1) });
    expect(parseQuery(new NextRequest('http://x/?page=2'), Q)).toEqual({ page: 2 });
    expect((await thrown(() => parseQuery(new NextRequest('http://x/?page=0'), Q))).status).toBe(400);
  });

  it('flattenSearchParams keeps the first value of repeated params', () => {
    expect(flattenSearchParams({ a: ['1', '2'], b: '3', c: undefined })).toEqual({ a: '1', b: '3' });
  });
});
