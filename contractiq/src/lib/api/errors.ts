import { ERROR_CATALOG, type ErrorCode } from './error-catalog';

// Error classes — docs/specs/README.md §3.3, 00-foundation.md §6.5.
// `details` must never contain contract text, chat content or emails: only counts and field names.
export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
    public userMessage: string,
    public retryable = false,
    public details?: ErrorDetails,
  ) {
    super(code);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {}
export class UnauthorizedError extends AppError {}
export class ForbiddenError extends AppError {}
export class NotFoundError extends AppError {}
export class ConflictError extends AppError {}
export class PayloadError extends AppError {}
export class UpstreamError extends AppError {}
export class TimeoutError extends AppError {}

/** 429 RATE_LIMITED. Fills {retry_after} in the message; toErrorResponse sets Retry-After. */
export class RateLimitError extends AppError {
  constructor(
    public retryAfterSeconds: number,
    details?: ErrorDetails,
  ) {
    const entry = ERROR_CATALOG.RATE_LIMITED;
    const merged = { ...details, retry_after: retryAfterSeconds };
    super('RATE_LIMITED', entry.status, interpolate(entry.message, merged), entry.retryable, merged);
  }
}

/** Replaces {key} with String(details[key]); leaves unknown placeholders untouched. */
export function interpolate(template: string, details?: ErrorDetails): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    details && details[key] !== undefined && details[key] !== null ? String(details[key]) : match,
  );
}

export function appError(code: ErrorCode, details?: ErrorDetails): AppError {
  const entry = ERROR_CATALOG[code];
  const msg = interpolate(entry.message, details);
  switch (entry.status) {
    case 400:
      return new ValidationError(code, 400, msg, false, details);
    case 401:
      return new UnauthorizedError(code, 401, msg);
    case 403:
      return new ForbiddenError(code, 403, msg);
    case 404:
      return new NotFoundError(code, 404, msg);
    case 409:
      return new ConflictError(code, 409, msg, false, details);
    case 413:
    case 422:
      return new PayloadError(code, entry.status, msg, false, details);
    case 429:
      return new RateLimitError(Number(details?.retry_after ?? 60), details);
    case 502:
      return new UpstreamError(code, 502, msg, entry.retryable, details);
    case 504:
      return new TimeoutError(code, 504, msg, true, details);
    default:
      return new AppError(code, entry.status, msg, entry.retryable, details);
  }
}

export function toErrorResponse(err: unknown, requestId: string): Response {
  const app = err instanceof AppError ? err : appError('INTERNAL_ERROR');
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'x-request-id': requestId };
  if (app instanceof RateLimitError) headers['Retry-After'] = String(app.retryAfterSeconds);
  return Response.json(
    {
      error: { code: app.code, message: app.userMessage, retryable: app.retryable, details: app.details ?? {} },
      request_id: requestId,
    },
    { status: app.status, headers },
  );
}
