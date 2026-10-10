import { expect, expectNoSeriousA11yViolations, test } from './support';

// 13-data-lifecycle-gdpr.md §12.
test('edit name and data sharing; both survive a reload', async ({ page, user }) => {
  void user;
  await page.goto('/settings');
  await page.getByLabel('Full name').fill('Grace Hopper');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Help improve ContractIQ' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Preference saved').first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Grace Hopper');
  await expect(page.getByRole('switch', { name: 'Help improve ContractIQ' })).toHaveAttribute('aria-checked', 'true');
});

test('axe: /settings and the delete-account dialog have no serious or critical violations', async ({ page, user }) => {
  void user;
  await page.goto('/settings');
  await expectNoSeriousA11yViolations(page, '/settings');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete your account?' })).toBeVisible();
  await expectNoSeriousA11yViolations(page, 'delete-account dialog');
});
