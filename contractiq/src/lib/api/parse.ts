import 'server-only';
import type { NextRequest } from 'next/server';
import { z, type ZodError, type ZodTypeAny } from 'zod';
import { appError } from './errors';

// Request parsing (00-foundation.md §6.6). Field errors become VALIDATION_ERROR details.
function toValidationError(e: ZodError) {
  const flat = e.flatten();
  const details: Record<string, string> = Object.fromEntries(
    Object.entries(flat.fieldErrors).map(([k, v]) => [k, (v as string[] | undefined)?.[0] ?? 'Invalid value']),
  );
  if (flat.formErrors.length) details._form = flat.formErrors[0]!;
  return appError('VALIDATION_ERROR', details);
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw appError('VALIDATION_ERROR', { _form: 'Body must be valid JSON' });
  }
  const r = schema.safeParse(json);
  if (!r.success) throw toValidationError(r.error);
  return r.data;
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const r = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!r.success) throw toValidationError(r.error);
  return r.data;
}

/** Validates route params; a malformed value is reported as a field error (400). */
export function parseParams<S extends ZodTypeAny>(params: unknown, schema: S): z.infer<S> {
  const r = schema.safeParse(params);
  if (!r.success) throw toValidationError(r.error);
  return r.data;
}

/** Validates route params; a malformed id → 404 NOT_FOUND, so nothing about ids or existence leaks. */
export function parseParamsOr404<S extends ZodTypeAny>(params: unknown, schema: S): z.infer<S> {
  const r = schema.safeParse(params);
  if (!r.success) throw appError('NOT_FOUND');
  return r.data;
}

export const IdParamsSchema = z.object({ id: z.string().uuid() });

/** Next.js searchParams → plain object; repeated params keep their first value (10 §6.5). */
export function flattenSearchParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first !== undefined) out[k] = first;
  }
  return out;
}
