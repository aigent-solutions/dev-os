import { test as base, type Page } from '@playwright/test';
import { expect, seedCompletedContract, test } from './support';

// 14-onboarding-a11y.md §12/§13 — prefers-reduced-motion: reduce.
base('a Button transition lasts 0.01 ms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const duration = await page.getByRole('button', { name: 'Sign in' }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe('1e-05s');
});

/** Jumps to page 4 and records every scrollTop the viewer passes through on the way. */
async function scrollPositionsForPageJump(page: Page) {
  await expect(page.getByText('Page 1 of 4')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('region', { name: 'PDF document' }).evaluate((el) => {
    (window as unknown as { __tops: number[] }).__tops = [];
    el.addEventListener('scroll', () => (window as unknown as { __tops: number[] }).__tops.push(el.scrollTop));
  });
  const gov = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
  await gov.getByRole('button', { name: 'Go to page 4' }).click();
  await expect(page.getByText('Page 4 of 4')).toBeVisible();
  await page.waitForTimeout(1000); // let any smooth scroll finish
  return page.evaluate(() => [...new Set((window as unknown as { __tops: number[] }).__tops)]);
}

test('goToPage scrolls instantly with reduced motion, smoothly without', async ({ page, user }) => {
  test.slow();
  const id = await seedCompletedContract(page, user);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/contracts/${id}`);
  const instant = await scrollPositionsForPageJump(page);
  const final = instant.at(-1)!;
  expect(final).toBeGreaterThan(0);
  // Straight there: no intermediate frames on the way from the top (a small settle after the page renders is fine).
  expect(instant.every((t) => Math.abs(t - final) < 120), `scroll positions: ${instant.join(', ')}`).toBe(true);

  // Control: the same jump without the preference animates through intermediate positions.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`/contracts/${id}`);
  const smooth = await scrollPositionsForPageJump(page);
  expect(smooth.some((t) => Math.abs(t - smooth.at(-1)!) >= 120), `scroll positions: ${smooth.join(', ')}`).toBe(true);
});
