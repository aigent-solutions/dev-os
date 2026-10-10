// Browser API client — the only way hooks call JSON APIs (00-foundation.md §6.10).
// Exceptions: chat SSE (src/lib/chat/sse-client.ts), export downloads, the health banner.
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable: boolean,
    public details: Record<string, unknown>,
    public requestId: string | null,
    public retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Toast tone for a failed request: rate limits are a yellow warning (12 §9), everything else danger. */
export function errorTone(e: unknown): 'warning' | 'danger' {
  return e instanceof ApiClientError && e.status === 429 ? 'warning' : 'danger';
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string; retryable?: boolean; details?: Record<string, unknown> };
  request_id?: string;
};

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { json, timeoutMs = 30_000, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: 'same-origin',
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
  }).catch(() => {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error — check your connection and try again.', true, {}, null, null);
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const envelope = (body ?? {}) as ErrorEnvelope;
    const e = envelope.error ?? {};
    throw new ApiClientError(
      res.status,
      e.code ?? 'INTERNAL_ERROR',
      e.message ?? 'Something went wrong on our side. Please try again.',
      e.retryable ?? res.status >= 500,
      e.details ?? {},
      envelope.request_id ?? null,
      Number(res.headers.get('Retry-After')) || null,
    );
  }
  return body as T;
}
