import { afterEach, describe, expect, it, vi } from 'vitest';
import { signedUrlRefreshDelay } from '@/hooks/useContract';
import type { ContractDetail } from '@/types/api';

// 07-document-viewer.md §12 — refresh the signed PDF URL shortly before it expires.
afterEach(() => vi.useRealTimers());
const at = (iso: string | null) => ({ pdf_url_expires_at: iso }) as ContractDetail;

describe('signedUrlRefreshDelay', () => {
  it('no expiry → false (no polling)', () => {
    expect(signedUrlRefreshDelay(undefined)).toBe(false);
    expect(signedUrlRefreshDelay(at(null))).toBe(false);
  });
  it('expiry in 60 min → ≈ 55 min', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    expect(signedUrlRefreshDelay(at('2026-10-10T13:00:00Z'))).toBe(55 * 60_000);
  });
  it('already expired → 10 s (never faster)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    expect(signedUrlRefreshDelay(at('2026-10-10T11:00:00Z'))).toBe(10_000);
  });
});
