import { expect, seedCompletedContract, test } from './support';

// 07-document-viewer.md §12 — real PDF.js. The demo NDA has 4 pages; Governing Law is on page 4.
test('click a term → its page is in view with the sentence highlighted; zoom keeps the page', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.goto(`/contracts/${id}`);
  await expect(page.getByText('Page 1 of 4')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Show Governing Law in the document' }).click();
  await expect(page.getByText('Page 4 of 4')).toBeVisible();
  const highlight = page.locator('.react-pdf__Page__textContent [data-ciq-highlight="true"]').first();
  await expect(highlight).toBeVisible();
  await expect(highlight).toBeInViewport();
  // The highlight must not hide the text it marks (regression: an opaque fill once covered the PDF text).
  expect(await highlight.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(.*0\.35\)/);

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveText('150%');
  await expect(page.getByText('Page 4 of 4')).toBeVisible();
});
