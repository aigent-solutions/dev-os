import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { demoPdfWithToken, expect, fixturePdf, mockOverride, test, uniqueToken } from './support';

// 03 §12 (upload errors), 05 §12 (OpenAI failure + retry), 12 §12 (429 toast).
async function chooseNda(page: Page) {
  await page.goto('/contracts/new');
  await page.getByRole('combobox', { name: 'Contract type' }).click();
  await page.getByRole('option', { name: /NDA/ }).click();
}
const fileInput = (page: Page) => page.locator('input[type="file"]');

test.describe('rejected uploads show the exact message and leave nothing behind', () => {
  test('a scanned PDF', async ({ page, user }) => {
    void user;
    await chooseNda(page);
    await fileInput(page).setInputFiles(fixturePdf('scanned-1p.pdf'));
    await expect(page.getByRole('alert').filter({ hasText: /Scanned PDFs are not supported yet\. Please upload a PDF with selectable text\./ })).toBeVisible({ timeout: 20_000 }); // Next.js also renders a route-announcer alert
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'No contracts reviewed yet' })).toBeVisible();
  });

  test('a 21-page PDF', async ({ page, user }) => {
    void user;
    await chooseNda(page);
    await fileInput(page).setInputFiles(fixturePdf('msa-21p.pdf'));
    await expect(page.getByRole('alert').filter({ hasText: /This contract has 21 pages\. ContractIQ currently supports up to 20 pages\./ })).toBeVisible({ timeout: 20_000 }); // Next.js also renders a route-announcer alert
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'No contracts reviewed yet' })).toBeVisible();
  });

  test('an 11 MB file is rejected before upload', async ({ page, user }) => {
    void user;
    await chooseNda(page);
    await fileInput(page).setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)]) });
    await expect(page.getByRole('alert').filter({ hasText: /Please upload a PDF under 10 MB\./ })).toBeVisible({ timeout: 20_000 }); // Next.js also renders a route-announcer alert
    await page.goto('/dashboard');
    await expect(page.getByRole('region', { name: 'No contracts reviewed yet' })).toBeVisible();
  });
});

test('OpenAI down (503 × 3) → error card → service back → "Try again" → results, without re-uploading', async ({ page, user }) => {
  void user;
  test.slow();
  const token = uniqueToken();
  await mockOverride(page, { match: token, kind: 'extraction', status: 503, times: 3 });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ciq-e2e-')), 'Outage NDA.pdf');
  writeFileSync(file, demoPdfWithToken(token));

  await chooseNda(page);
  await fileInput(page).setInputFiles(file);
  await expect(page.getByRole('button', { name: 'Process Contract' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Process Contract' }).click();
  await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const card = page.locator('[data-error-code]');
  await expect(card).toHaveAttribute('data-error-code', 'OPENAI_UNAVAILABLE', { timeout: 30_000 });
  await expect(card.getByText("We couldn't analyse your contract right now. Try again in a few minutes.")).toBeVisible();

  await card.getByRole('button', { name: 'Try again' }).click(); // the override is used up: the mock answers normally
  await expect(page.getByRole('list', { name: 'Key terms' }).getByRole('listitem')).toHaveCount(10, { timeout: 30_000 });
});

test('a 429 from /process shows the wait-time toast', async ({ page, user }) => {
  void user;
  await page.route('**/api/contracts/*/process', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'Retry-After': '42', 'content-type': 'application/json' },
      body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: "You're doing that a lot — please wait 42 seconds and try again.", retryable: true, details: { retry_after: 42 } }, request_id: 'req_x' }),
    }),
  );
  await chooseNda(page);
  await fileInput(page).setInputFiles(fixturePdf('demo-nda-4p.pdf'));
  await expect(page.getByRole('button', { name: 'Process Contract' })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Process Contract' }).click();
  await expect(page.getByText("You're doing that a lot — please wait 42 seconds and try again.")).toBeVisible();
});
