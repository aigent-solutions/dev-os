import { DEMO_PDF, expect, test } from './support';

// The core journey (03/04/05/06/08 §12): upload → custom terms → process → results → navigate → review → edit.
test('upload an NDA with 2 custom terms, review it, and edit a term', async ({ page, user }) => {
  void user; // signs in a fresh, onboarded account
  test.slow();
  await page.goto('/contracts/new');

  // 03: type → upload → extract.
  await page.getByRole('combobox', { name: 'Contract type' }).click();
  await page.getByRole('option', { name: /NDA/ }).click();
  await page.locator('input[type="file"]').setInputFiles(DEMO_PDF);
  await expect(page.getByText('demo-nda-4p.pdf')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('· 4 pages')).toBeVisible();
  const processButton = page.getByRole('button', { name: 'Process Contract' });
  await expect(processButton).toBeEnabled();

  // 04: two custom terms.
  await page.getByRole('button', { name: 'Add Key Term' }).click();
  const input = page.getByRole('textbox', { name: 'Custom key term' });
  await input.fill('Audit rights');
  await input.press('Enter');
  await input.fill('Insurance requirements');
  await input.press('Enter');
  await expect(page.getByText('10 standard terms for NDA · 2/5 custom')).toBeVisible();

  // 05: process → progress → results.
  await processButton.click();
  await expect(page.getByRole('list', { name: 'Analysis progress' })).toBeVisible();
  await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const terms = page.getByRole('list', { name: 'Key terms' });
  await expect(terms.getByRole('listitem')).toHaveCount(12);
  await expect(terms.getByText('Custom')).toHaveCount(2);
  await expect(terms.getByRole('listitem').filter({ hasText: 'Audit rights' }).getByText('Not found in document')).toBeVisible();

  // 06/07: a term jumps the viewer to its page; "Why?" shows the source sentence.
  const gov = terms.getByRole('listitem').filter({ hasText: 'Governing Law' });
  await gov.getByRole('button', { name: 'Show Governing Law in the document' }).click();
  await expect(page.getByText('Page 4 of 4')).toBeVisible();
  await gov.getByRole('button', { name: /Why\?/ }).click();
  await expect(gov.getByText('“This Agreement is governed by the laws of England and Wales.”')).toBeVisible();

  // 06: mark review complete; it survives a reload.
  await page.getByRole('button', { name: 'Mark review complete' }).click();
  const header = page.locator('main header', { hasText: 'demo-nda-4p.pdf' });
  await expect(header.getByText('Reviewed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark review as not complete' })).toBeVisible();
  await page.reload();
  await expect(page.locator('main header', { hasText: 'demo-nda-4p.pdf' }).getByText('Reviewed', { exact: true })).toBeVisible();

  // 08: edit a value inline → Edited badge → persists → popover shows the AI original.
  const govAfter = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
  await govAfter.getByRole('button', { name: 'Edit Governing Law value' }).click();
  const value = page.getByRole('textbox', { name: 'Governing Law value' });
  await value.fill('Scotland');
  const saved = page.waitForResponse((r) => r.url().includes('/api/key-terms/') && r.request().method() === 'PATCH');
  await value.press('Enter');
  await expect(govAfter.getByRole('button', { name: /^Edited\./ })).toBeVisible({ timeout: 2_000 }); // optimistic
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200); // the save itself, before reloading
  await page.reload();
  const reloaded = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
  await expect(reloaded.getByText('Scotland')).toBeVisible();
  await reloaded.getByRole('button', { name: /^Edited\./ }).click();
  await expect(page.getByRole('dialog').getByText('England and Wales')).toBeVisible();
});
