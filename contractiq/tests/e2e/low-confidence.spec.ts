import { expect, seedCompletedContract, test } from './support';

// 05/06 §12 — the mocked extraction fabricates the Breach & Remedy source sentence; verification caps it below 50.
test('a fabricated source sentence → ⚠️, confidence < 50, tooltip on focus, term still listed', async ({ page, user }) => {
  const id = await seedCompletedContract(page, user);
  await page.goto(`/contracts/${id}`);
  const row = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Breach & Remedy' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Confidence 49%, Low' })).toBeVisible();
  const warning = row.getByRole('button', { name: /Low confidence for Breach & Remedy/ });
  await expect(warning).toBeVisible();
  await warning.focus();
  await expect(page.getByRole('tooltip')).toContainText('Low confidence — we recommend verifying this in the document directly.');
  await row.getByRole('button', { name: /Why\?/ }).click();
  await expect(row.getByText('Source not verified')).toBeVisible();
  // Verified terms are not flagged.
  const gov = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
  await expect(gov.getByRole('button', { name: /Low confidence/ })).toHaveCount(0);
});
