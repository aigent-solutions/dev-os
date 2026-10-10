import { test as base } from '@playwright/test';
import { seedContract } from '../helpers/factories';
import { sql } from '../helpers/db';
import { createUser, DEMO_PDF, expect, expectNoSeriousA11yViolations, fixturePdf, seedCompletedContract, signIn, test } from './support';

// 14-onboarding-a11y.md §12 — axe (WCAG 2.1 A/AA) on every page, state and open dialog: 0 serious / critical.
base.describe('signed out', () => {
  for (const path of ['/', '/login', '/signup', '/verify-email', '/terms']) {
    base(`axe ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectNoSeriousA11yViolations(page, path);
    });
  }
  base('axe /login with the verification-failed banner', async ({ page }) => {
    await page.goto('/login?error=verification_failed');
    await expectNoSeriousA11yViolations(page, '/login?error');
  });
});

test.describe('dashboard', () => {
  test('empty', async ({ page, user }) => {
    void user;
    await page.goto('/dashboard');
    await expectNoSeriousA11yViolations(page, '/dashboard (empty)');
  });

  test('populated, with the row menu and the delete dialog open', async ({ page, user }) => {
    await seedContract(user.id, { file_name: 'Reviewed NDA.pdf', review_completed_at: new Date().toISOString() });
    await seedContract(user.id, { file_name: 'Failed MSA.pdf', contract_type: 'msa', status: 'error', error_code: 'OPENAI_UNAVAILABLE' });
    await seedContract(user.id, { file_name: 'Ready NDA.pdf', status: 'ready' });
    await page.goto('/dashboard');
    await expectNoSeriousA11yViolations(page, '/dashboard (populated)');
    await page.getByRole('button', { name: 'Actions for Reviewed NDA.pdf' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'row menu');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'delete-contract dialog');
  });
});

test.describe('/contracts/new', () => {
  test('each wizard step', async ({ page, user }) => {
    void user;
    await page.goto('/contracts/new');
    await expectNoSeriousA11yViolations(page, 'wizard: select');
    await page.getByRole('combobox', { name: 'Contract type' }).click();
    // Known limitation: while a Radix Select listbox is open it aria-hides the page (no non-modal option, unlike
    // DropdownMenu). Focus is trapped in the listbox, so nothing hidden is reachable; every other rule still runs.
    await expectNoSeriousA11yViolations(page, 'wizard: type listbox open', { disableRules: ['aria-hidden-focus'] });
    await page.getByRole('option', { name: /NDA/ }).click();
    await page.getByRole('button', { name: 'Add Key Term' }).click();
    await page.getByRole('textbox', { name: 'Custom key term' }).fill('<script>');
    await page.getByRole('textbox', { name: 'Custom key term' }).press('Enter');
    await expectNoSeriousA11yViolations(page, 'wizard: type chosen + custom-term error');
    await page.getByRole('textbox', { name: 'Custom key term' }).press('Escape');
    await page.locator('input[type="file"]').setInputFiles(DEMO_PDF);
    await expect(page.getByRole('button', { name: 'Process Contract' })).toBeEnabled({ timeout: 20_000 });
    await expectNoSeriousA11yViolations(page, 'wizard: file ready');
  });

  test('upload error banner', async ({ page, user }) => {
    void user;
    await page.goto('/contracts/new');
    await page.getByRole('combobox', { name: 'Contract type' }).click();
    await page.getByRole('option', { name: /NDA/ }).click();
    await page.locator('input[type="file"]').setInputFiles(fixturePdf('scanned-1p.pdf'));
    await expect(page.getByRole('alert').filter({ hasText: /Scanned PDFs/ })).toBeVisible({ timeout: 20_000 });
    await expectNoSeriousA11yViolations(page, 'wizard: error');
  });
});

test.describe('/contracts/[id]', () => {
  test('processing', async ({ page, user }) => {
    const c = await seedContract(user.id, { status: 'ready' });
    await sql(`update public.contracts set status = 'processing', processing_stage = 'analysing', processing_attempts = 1, processing_started_at = now() where id = $1`, [c.id]);
    await page.goto(`/contracts/${c.id}`);
    await expect(page.getByRole('list', { name: 'Analysis progress' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'contract: processing');
  });

  test('error', async ({ page, user }) => {
    const c = await seedContract(user.id, { status: 'error', error_code: 'OPENAI_UNAVAILABLE', processing_attempts: 1 });
    await page.goto(`/contracts/${c.id}`);
    await expect(page.locator('[data-error-code]')).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'contract: error');
  });

  test('results: Key Terms tab, "Why?" open, Edited popover, Chat tab with an answer, delete dialog', async ({ page, user }) => {
    test.slow();
    const id = await seedCompletedContract(page, user);
    await page.goto(`/contracts/${id}`);
    await expect(page.getByText('Page 1 of 4')).toBeVisible({ timeout: 20_000 });
    await expectNoSeriousA11yViolations(page, 'results: key terms');

    const gov = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
    await gov.getByRole('button', { name: /Why\?/ }).click();
    await gov.getByRole('button', { name: 'Edit Governing Law value' }).click();
    await page.getByRole('textbox', { name: 'Governing Law value' }).fill('Scotland');
    const saved = page.waitForResponse((r) => r.url().includes('/api/key-terms/'));
    await page.getByRole('textbox', { name: 'Governing Law value' }).press('Enter');
    await saved;
    await gov.getByRole('button', { name: /^Edited\./ }).click();
    await expect(page.getByRole('button', { name: 'Restore AI value' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'results: why + edited popover');
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Chat' }).click();
    await page.getByRole('textbox', { name: 'Ask a question about this contract' }).fill('How can either party end this agreement?');
    await page.getByRole('textbox', { name: 'Ask a question about this contract' }).press('Enter');
    await expect(page.getByRole('log', { name: 'Conversation' }).getByRole('button', { name: /Go to page 3/ }).first()).toBeVisible({ timeout: 20_000 });
    await expectNoSeriousA11yViolations(page, 'results: chat');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'results: delete dialog');
  });

  test('results at 375 px (tabs + mobile banner)', async ({ page, user }) => {
    const id = await seedCompletedContract(page, user);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/contracts/${id}`);
    await expect(page.getByRole('tab', { name: 'Document' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'results @375');
  });
});

test('/settings', async ({ page, user }) => {
  void user;
  await page.goto('/settings');
  await expectNoSeriousA11yViolations(page, '/settings');
});

base('an onboarding tip (new account)', async ({ page, context, baseURL }) => {
  const user = await createUser({ onboarded: false });
  await signIn(context, user, baseURL!);
  await page.goto('/dashboard');
  await expect(page.getByRole('dialog', { name: 'Start here' })).toBeVisible();
  await expectNoSeriousA11yViolations(page, 'onboarding tip D1');
});

base('UI primitives gallery (dev builds)', async ({ page }) => {
  const res = await page.goto('/__ui');
  base.skip(res?.status() === 404, 'only in dev builds');
  await expectNoSeriousA11yViolations(page, '/__ui');
});
