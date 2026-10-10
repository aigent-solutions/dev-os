import { seedContract } from '../helpers/factories';
import { expect, test } from './support';

// 14-onboarding-a11y.md §12/§13 — 375 px. Runs in the default project with a 375 × 812 touch viewport
// (the mobile-chrome project's Pixel 7 is 412 px wide).
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

const BANNER = 'For the best experience with large PDFs, use a desktop browser (Chrome or Firefox).';

test('the desktop-browser banner on /contracts/new: dismiss → stays hidden after a reload', async ({ page, user }) => {
  void user;
  await page.goto('/contracts/new');
  await expect(page.getByText(BANNER)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss desktop browser tip' }).click();
  await expect(page.getByText(BANNER)).toBeHidden();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Contract type' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ciq:mobile-banner-dismissed'))).toBe('1');
  await page.waitForTimeout(1000); // the banner mounts client-side; give it the chance to (wrongly) appear
  await expect(page.getByText(BANNER)).toBeHidden();
});

test('no horizontal scroll on a populated dashboard at 375 px', async ({ page, user }) => {
  await seedContract(user.id, { file_name: 'Mutual Non-Disclosure Agreement between Northwind Holdings and Contoso Ltd (final, signed).pdf' });
  await seedContract(user.id, { file_name: 'Master Services Agreement.pdf', contract_type: 'msa', status: 'error', error_code: 'OPENAI_UNAVAILABLE' });
  await seedContract(user.id, { file_name: 'Reviewed NDA.pdf', review_completed_at: new Date().toISOString() });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Your contracts' })).toBeVisible();
  await expect(page.getByText('Reviewed NDA.pdf').first()).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
