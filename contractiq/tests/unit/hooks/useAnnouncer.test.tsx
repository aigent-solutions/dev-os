import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Announcer } from '@/components/layout/Announcer';
import { useAnnouncer } from '@/hooks/useAnnouncer';

// 14-onboarding-a11y.md §13.
afterEach(() => vi.useRealTimers());

function Speaker({ message, politeness }: { message: string; politeness?: 'polite' | 'assertive' }) {
  const announce = useAnnouncer();
  return <button type="button" onClick={() => announce(message, politeness)}>speak</button>;
}

describe('useAnnouncer + <Announcer />', () => {
  it('writes the message into the polite live region and clears it after 1 s', () => {
    vi.useFakeTimers();
    const { container } = render(<><Announcer /><Speaker message="Saved Governing Law" /></>);
    act(() => screen.getByRole('button').click());
    const polite = container.querySelector('[aria-live="polite"]')!;
    expect(polite).toHaveTextContent('Saved Governing Law');
    act(() => vi.advanceTimersByTime(1000));
    expect(polite).toBeEmptyDOMElement();
  });

  it('assertive messages go to the assertive region', () => {
    const { container } = render(<><Announcer /><Speaker message="Upload failed" politeness="assertive" /></>);
    act(() => screen.getByRole('button').click());
    expect(container.querySelector('[aria-live="assertive"]')).toHaveTextContent('Upload failed');
    expect(container.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement();
  });
});
