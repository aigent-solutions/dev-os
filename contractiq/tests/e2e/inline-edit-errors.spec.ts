import { expect, seedCompletedContract, test } from './support';

// 08-inline-editing.md §12 — a failed save reverts the value, shows a toast, and Retry re-opens the draft.
test('PATCH 500 → value reverts and a toast appears; Retry re-opens the editor holding the draft', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.route('**/api/key-terms/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.', retryable: true, details: {} }, request_id: 'req_x' }) })
      : route.continue(),
  );
  await page.goto(`/contracts/${id}`);
  const row = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
  await row.getByRole('button', { name: 'Edit Governing Law value' }).click();
  await page.getByRole('textbox', { name: 'Governing Law value' }).fill('Scotland');
  await page.getByRole('textbox', { name: 'Governing Law value' }).press('Enter');

  await expect(page.getByText("Couldn't save Governing Law").first()).toBeVisible(); // Radix also copies toast text into its announcer
  await expect(row.getByRole('button', { name: 'Edit Governing Law value' })).toHaveText('England and Wales');
  await expect(row.getByRole('button', { name: /^Edited\./ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('textbox', { name: 'Governing Law value' })).toHaveValue('Scotland');
});
