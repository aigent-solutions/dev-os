import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSseResponse } from '@/lib/api/sse';

// 00-foundation.md §12.2.
afterEach(() => vi.useRealTimers());

describe('createSseResponse', () => {
  it('frames events as "event:" / "data:" and closes when run resolves', async () => {
    const res = createSseResponse(async (send) => {
      send('meta', { a: 1 });
      send('done', { b: 'x' });
    });
    expect(res.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(await res.text()).toBe('event: meta\ndata: {"a":1}\n\nevent: done\ndata: {"b":"x"}\n\n');
  });

  it('sends a keep-alive comment every 15 s while running', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const res = createSseResponse(() => new Promise<void>((r) => (finish = r)));
    const text = res.text();
    await vi.advanceTimersByTimeAsync(15_000);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(await text).toBe(': keep-alive\n\n');
  });

  it('cancelling the stream aborts the run signal', async () => {
    let signal!: AbortSignal;
    const res = createSseResponse(async (_send, s) => {
      signal = s;
      await new Promise((r) => s.addEventListener('abort', r));
    });
    const reader = res.body!.getReader();
    await new Promise((r) => setTimeout(r, 0));
    await reader.cancel();
    expect(signal.aborted).toBe(true);
  });
});
