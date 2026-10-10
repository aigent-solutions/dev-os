import { expect, seedCompletedContract, test } from './support';

// 07-document-viewer.md §12 — the signed PDF URL fails → text viewer with every page; navigation still works.
test('signed URL 403 → text viewer → clicking a term scrolls to its page and marks the sentence', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.route('**/storage/v1/object/sign/**', (route) => route.fulfill({ status: 403, body: 'forbidden' }));
  await page.goto(`/contracts/${id}`);
  await expect(page.getByText(/couldn't display the PDF here/)).toBeVisible({ timeout: 20_000 });
  for (const n of [1, 2, 3, 4]) await expect(page.locator(`#text-page-${n}`).getByText(`Page ${n}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show Governing Law in the document' }).click();
  const mark = page.locator('#text-page-4 mark');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveText('This Agreement is governed by the laws of England and Wales.');
  await expect(mark).toBeInViewport();
});
