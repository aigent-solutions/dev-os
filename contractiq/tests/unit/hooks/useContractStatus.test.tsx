import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContractStatus } from '@/hooks/useContractStatus';
import { apiFetch } from '@/lib/api-client';

// 05-key-term-extraction.md §12 — polls every 2 s while processing, stops on any terminal status.
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn() }));
afterEach(() => vi.useRealTimers());

const processing = { status: 'processing', processing_stage: 'analysing', error: null, elapsed_ms: 1000 };
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

describe('useContractStatus', () => {
  it.each(['completed', 'error'])('stops polling once the status is %s', async (terminal) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiFetch).mockReset().mockResolvedValueOnce(processing).mockResolvedValue({ ...processing, status: terminal });
    const { result } = renderHook(() => useContractStatus('c-1', { enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe('processing'));
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    await waitFor(() => expect(result.current.data?.status).toBe(terminal));
    const calls = vi.mocked(apiFetch).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(vi.mocked(apiFetch).mock.calls.length).toBe(calls);
    expect(apiFetch).toHaveBeenCalledWith('/api/contracts/c-1/status');
  });

  it('keeps polling every 2 s while processing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(apiFetch).mockReset().mockResolvedValue(processing);
    renderHook(() => useContractStatus('c-1', { enabled: true }), { wrapper });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(vi.mocked(apiFetch).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('does not fetch when disabled', async () => {
    vi.mocked(apiFetch).mockReset();
    renderHook(() => useContractStatus('c-1', { enabled: false }), { wrapper });
    await new Promise((r) => setTimeout(r, 50));
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
