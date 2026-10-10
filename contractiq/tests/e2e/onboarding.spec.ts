import { sql } from '../helpers/db';
import { DEMO_PDF, expect, test } from './support';

// 14-onboarding-a11y.md §13 — first-run tips for a brand-new account.
test.use({ userOptions: { onboarded: false } });
const tip = (page: import('@playwright/test').Page) => page.locator('[data-onboarding-popover]');

test('D1 → U1 → R1, R2, R3 → Done completes the tour; no tips afterwards', async ({ page, user }) => {
  test.slow();
  await page.goto('/dashboard');
  await expect(page.getByRole('dialog', { name: 'Start here' })).toContainText('1 of 5');
  await expect(page.getByRole('dialog', { name: 'Start here' }).getByRole('button', { name: 'Done', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tip(page)).toHaveCount(0);

  await page.locator('[data-onboarding="review-cta"]').click();
  await page.getByRole('combobox', { name: 'Contract type' }).click();
  await page.getByRole('option', { name: /NDA/ }).click();
  const u1 = page.getByRole('dialog', { name: "What we'll look for" });
  await expect(u1).toContainText('2 of 5');
  await expect(u1.getByRole('button', { name: 'Done', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');

  await page.locator('input[type="file"]').setInputFiles(DEMO_PDF);
  await expect(page.getByRole('button', { name: 'Process Contract' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Process Contract' }).click();
  await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });

  for (const [title, counter, button] of [['How sure is the AI?', '3 of 5', 'Next'], ['See the source', '4 of 5', 'Next'], ['Ask questions', '5 of 5', 'Done']] as const) {
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toContainText(counter, { timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: button, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(tip(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Chat' }).first()).toBeFocused();
  await expect.poll(async () => (await sql<{ t: Date | null }>('select onboarding_completed_at t from public.profiles where id = $1', [user.id]))[0]!.t).not.toBeNull();

  await page.reload();
  await page.getByRole('list', { name: 'Key terms' }).waitFor();
  await page.waitForTimeout(1500);
  await expect(tip(page)).toHaveCount(0);
});

test('Skip tips at D1 → no U1 on the upload page', async ({ page, user }) => {
  await page.goto('/dashboard');
  await page.getByRole('dialog', { name: 'Start here' }).getByRole('button', { name: 'Skip tips' }).click();
  await expect(tip(page)).toHaveCount(0);
  await expect.poll(async () => (await sql<{ t: Date | null }>('select onboarding_completed_at t from public.profiles where id = $1', [user.id]))[0]!.t).not.toBeNull();
  await page.locator('[data-onboarding="review-cta"]').click();
  await page.getByRole('combobox', { name: 'Contract type' }).click();
  await page.getByRole('option', { name: /NDA/ }).click();
  await page.waitForTimeout(1500);
  await expect(tip(page)).toHaveCount(0);
});
