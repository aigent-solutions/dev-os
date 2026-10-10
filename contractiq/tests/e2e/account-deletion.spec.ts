import { expect, PASSWORD, seedCompletedContract, test } from './support';
import { adminClient } from '../helpers/session';

// 13-data-lifecycle-gdpr.md §12 — GDPR erasure from the UI.
test('upload a contract → /settings → type DELETE → landing toast → the same credentials no longer work', async ({ page, user }) => {
  await seedCompletedContract(page, user);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  const confirm = dialog.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Your account and all data have been deleted').first()).toBeVisible();
  const { data } = await adminClient().auth.admin.getUserById(user.id);
  expect(data.user).toBeNull();

  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password')).toBeVisible();
});
