import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider';
import { OnboardingTooltips } from '@/components/onboarding/OnboardingTooltips';
import type { OnboardingPage } from '@/components/onboarding/steps';
import { apiFetch } from '@/lib/api-client';
import { renderWithClient } from '../../../helpers/render';

// 14-onboarding-a11y.md §13 — apiFetch mocked; anchors are plain elements with data-onboarding.
vi.mock('@/lib/api-client', async (orig) => ({ ...(await orig<typeof import('@/lib/api-client')>()), apiFetch: vi.fn(async () => ({ onboarding_completed_at: '2026-10-10T00:00:00Z' })) }));
const SEEN = 'ciq:onboarding:seen';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(apiFetch).mockClear();
  // jsdom gives every element a zero rect, which the "is it visible?" check reads as hidden.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{ width: 10, height: 10 }] as unknown as DOMRectList);
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const ANCHORS: Record<OnboardingPage, string[]> = { dashboard: ['review-cta'], upload: ['term-preview'], results: ['confidence-badge', 'why-toggle', 'chat-tab'] };
function setup(page: OnboardingPage, opts: { completed?: boolean; anchors?: string[] } = {}) {
  const anchors = opts.anchors ?? ANCHORS[page];
  return renderWithClient(
    <OnboardingProvider completed={opts.completed ?? false}>
      {anchors.map((a) => (
        <button key={a} type="button" data-onboarding={a}>{a}</button>
      ))}
      <OnboardingTooltips page={page} />
    </OnboardingProvider>,
  );
}
const tip = () => screen.queryByRole('dialog');

describe('OnboardingTooltips', () => {
  it('completed=true renders nothing', async () => {
    setup('dashboard', { completed: true });
    await act(async () => undefined);
    expect(tip()).toBeNull();
  });

  it('shows D1 once its anchor exists, with "1 of 5" and focus on Done', async () => {
    setup('dashboard');
    const dialog = await screen.findByRole('dialog', { name: 'Start here' });
    expect(dialog).toHaveTextContent('1 of 5');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'review-cta' })).toHaveAttribute('data-onboarding-active', 'true');
  });

  it('Next and Done advance, then the page is recorded as seen (results also completes the tour)', async () => {
    setup('results');
    const user = userEvent.setup();
    expect(await screen.findByRole('dialog', { name: 'How sure is the AI?' })).toHaveTextContent('3 of 5');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'See the source' })).toHaveTextContent('4 of 5');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('dialog', { name: 'Ask questions' })).toHaveTextContent('5 of 5');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(tip()).toBeNull());
    expect(JSON.parse(localStorage.getItem(SEEN)!)).toEqual(['results']);
    expect(apiFetch).toHaveBeenCalledWith('/api/account', { method: 'PATCH', json: { onboarding_completed: true } });
  });

  it('Done on the dashboard records the page but does not complete the tour', async () => {
    setup('dashboard');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Done' }));
    expect(JSON.parse(localStorage.getItem(SEEN)!)).toEqual(['dashboard']);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('Skip tips completes the tour (PATCH) and hides all tips', async () => {
    setup('dashboard');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Skip tips' }));
    await waitFor(() => expect(tip()).toBeNull());
    expect(apiFetch).toHaveBeenCalledWith('/api/account', { method: 'PATCH', json: { onboarding_completed: true } });
  });

  it('Esc closes the page’s tips without calling the API', async () => {
    setup('dashboard');
    await screen.findByRole('dialog');
    await userEvent.setup().keyboard('{Escape}');
    await waitFor(() => expect(tip()).toBeNull());
    expect(apiFetch).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(SEEN)!)).toEqual(['dashboard']);
  });

  it('a missing anchor is skipped after 10 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup('results', { anchors: ['chat-tab'] }); // no confidence-badge / why-toggle
    // Each step's 10 s timer is scheduled after a re-render, so step second by second like real time.
    for (let i = 0; i < 9; i++) await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(tip()).toBeNull(); // R1 still waiting at 9 s
    for (let i = 0; i < 13; i++) await act(() => vi.advanceTimersByTimeAsync(1_000)); // R1, then R2, time out
    expect(await screen.findByRole('dialog', { name: 'Ask questions' })).toHaveTextContent('5 of 5');
  });

  it('R1 shows "3 of 5" even when the results page is the first page visited', async () => {
    setup('results');
    expect(await screen.findByRole('dialog', { name: 'How sure is the AI?' })).toHaveTextContent('3 of 5');
  });

  it('a page already seen shows nothing', async () => {
    localStorage.setItem(SEEN, JSON.stringify(['dashboard']));
    renderWithClient(<OnboardingProvider completed={false}><button type="button" data-onboarding="review-cta">x</button><OnboardingTooltips page="dashboard" /></OnboardingProvider>);
    await act(async () => undefined);
    expect(tip()).toBeNull();
  });
});
