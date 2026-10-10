import { expect, seedCompletedContract, test } from './support';

// 07-document-viewer.md §12 — 375 × 812: Key Terms tab → a term → the Document tab shows its page.
test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test('selecting a term on mobile switches to the Document tab at that page', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.goto(`/contracts/${id}`);
  await page.getByRole('tab', { name: 'Key Terms' }).click();
  await page.getByRole('button', { name: 'Show Governing Law in the document' }).click();
  await expect(page.getByRole('tab', { name: 'Document' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Page 4 of 4')).toBeVisible({ timeout: 20_000 });
});
