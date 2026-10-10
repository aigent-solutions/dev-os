import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileDeviceBanner } from '@/components/layout/MobileDeviceBanner';
import { mockViewport } from '../../../helpers/viewport';

// 14-onboarding-a11y.md §13.
const KEY = 'ciq:mobile-banner-dismissed';
const TEXT = /For the best experience with large PDFs, use a desktop browser \(Chrome or Firefox\)\./;
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('MobileDeviceBanner', () => {
  it('shown at 375 px', async () => {
    mockViewport(375);
    render(<MobileDeviceBanner />);
    expect(await screen.findByText(TEXT)).toBeInTheDocument();
  });

  it('hidden at 1024 px', async () => {
    mockViewport(1024);
    render(<MobileDeviceBanner />);
    await act(async () => undefined);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it('dismissal persists across remounts (reloads)', async () => {
    mockViewport(375);
    const { unmount } = render(<MobileDeviceBanner />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Dismiss desktop browser tip' }));
    expect(localStorage.getItem(KEY)).toBe('1');
    unmount();
    render(<MobileDeviceBanner />);
    await act(async () => undefined);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it('a throwing localStorage does not crash: the banner shows and can still be dismissed', async () => {
    mockViewport(375);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<MobileDeviceBanner />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Dismiss desktop browser tip' }));
    expect(screen.queryByText(TEXT)).toBeNull();
  });
});
