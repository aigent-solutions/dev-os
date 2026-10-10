import type { Locator, Page } from '@playwright/test';
import { createUser, DEMO_PDF, expect, PASSWORD, test } from './support';
import { adminClient } from '../helpers/session';

// 14-onboarding-a11y.md §12/§13 — the complete review flow by keyboard only (no mouse, no locator.click()).

/** Presses Tab until `target` has focus (≤ 120 presses), then checks a focus indicator is drawn. */
async function tabTo(page: Page, target: Locator, max = 120) {
  for (let i = 0; i <= max; i++) {
    if (await target.evaluate((el) => el === document.activeElement, undefined, { timeout: 2_000 }).catch(() => false)) {
      await expectFocusIndicator(target);
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${target.toString()}`);
}

/** The focused element draws an outline or a ring (Tailwind rings are box-shadows). */
async function expectFocusIndicator(target: Locator) {
  const style = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' };
  });
  expect(style.outline || style.shadow, `visible focus on ${target.toString()}`).toBe(true);
}

/** Screenshot diff: the area around `target` (ring offset included) differs with and without focus. */
async function expectRingInScreenshot(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const clip = { x: Math.max(0, box.x - 6), y: Math.max(0, box.y - 6), width: box.width + 12, height: box.height + 12 };
  const focused = await page.screenshot({ clip, animations: 'disabled' });
  await target.evaluate((el) => (el as HTMLElement).blur());
  const blurred = await page.screenshot({ clip, animations: 'disabled' });
  expect(focused.equals(blurred), `focus ring drawn on ${target.toString()}`).toBe(false);
  await target.focus(); // keyboard modality is kept, so :focus-visible applies again
}

test('upload → process → page link → "Why?" → edit → chat → page chip → feedback, keyboard only', async ({ page }) => {
  test.setTimeout(180_000);
  const user = await createUser();
  try {
    // Sign in.
    await page.goto('/login');
    await tabTo(page, page.getByLabel('Email'));
    await page.keyboard.type(user.email);
    await tabTo(page, page.getByLabel('Password', { exact: true }));
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 }); // first hit may compile the route

    // Dashboard → "Review a Contract".
    const review = page.getByRole('navigation').getByRole('link', { name: 'Review a Contract' });
    await tabTo(page, review);
    await expectRingInScreenshot(page, review);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/contracts\/new$/);

    // Contract type through the select, by arrow keys.
    const type = page.getByRole('combobox', { name: 'Contract type' });
    await tabTo(page, type);
    await page.keyboard.press('Enter');
    const nda = page.getByRole('option', { name: /NDA/ });
    await expect(page.getByRole('listbox')).toBeVisible();
    for (let i = 0; i < 6 && !(await nda.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
    await expect(nda).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(type).toHaveText(/NDA/);

    // Dropzone: Enter opens the file chooser.
    const zone = page.getByRole('button', { name: 'Upload a contract PDF' });
    await tabTo(page, zone);
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await chooser).setFiles(DEMO_PDF);
    const processButton = page.getByRole('button', { name: 'Process Contract' });
    await expect(processButton).toBeEnabled({ timeout: 20_000 });

    // A custom term.
    await tabTo(page, page.getByRole('button', { name: 'Add Key Term' }));
    await page.keyboard.press('Enter');
    await tabTo(page, page.getByRole('textbox', { name: 'Custom key term' }));
    await page.keyboard.type('Audit rights');
    await page.keyboard.press('Enter');
    await expect(page.getByText('10 standard terms for NDA · 1/5 custom')).toBeVisible();

    // Process.
    await tabTo(page, processButton);
    await expectRingInScreenshot(page, processButton);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expect(page.getByText('Page 1 of 4')).toBeVisible({ timeout: 20_000 });

    // A page link moves the viewer (Governing Law is on page 4, so the move is observable).
    const gov = page.getByRole('list', { name: 'Key terms' }).getByRole('listitem').filter({ hasText: 'Governing Law' });
    const pageLink = gov.getByRole('button', { name: 'Go to page 4' });
    await tabTo(page, pageLink);
    await expectRingInScreenshot(page, pageLink);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Page 4 of 4')).toBeVisible();

    // "Why?".
    await tabTo(page, gov.getByRole('button', { name: /Why\? Show the source sentence for Governing Law/ }));
    await page.keyboard.press('Enter');
    await expect(gov.getByText('“This Agreement is governed by the laws of England and Wales.”')).toBeVisible();

    // Edit a value; Enter saves.
    await tabTo(page, gov.getByRole('button', { name: 'Edit Governing Law value' }));
    await page.keyboard.press('Enter');
    const value = page.getByRole('textbox', { name: 'Governing Law value' });
    await expect(value).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Scotland');
    const saved = page.waitForResponse((r) => r.url().includes('/api/key-terms/') && r.request().method() === 'PATCH');
    await page.keyboard.press('Enter');
    expect((await saved).status()).toBe(200);
    await expect(gov.getByRole('button', { name: /^Edited\./ })).toBeVisible();

    // Chat tab by arrow keys, ask, follow the Page chip.
    await tabTo(page, page.getByRole('tab', { name: 'Key Terms' }));
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    await tabTo(page, page.getByRole('textbox', { name: 'Ask a question about this contract' }));
    await page.keyboard.type('How can either party end this agreement?');
    await page.keyboard.press('Enter');
    const chip = page.getByRole('log', { name: 'Conversation' }).getByRole('button', { name: 'Go to page 3 in the document' }).first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await tabTo(page, chip);
    await page.keyboard.press('Enter');
    await expect(page.getByText('Page 3 of 4')).toBeVisible();

    // Feedback (in the Key Terms tab).
    await tabTo(page, page.getByRole('tab', { name: 'Chat' }));
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Key Terms' })).toHaveAttribute('aria-selected', 'true');
    const widget = page.getByRole('region', { name: 'Was this review helpful?' });
    await tabTo(page, widget.getByRole('button', { name: 'Yes, helpful' }));
    await page.keyboard.press('Enter');
    await expect(widget.getByText('Thanks for your feedback')).toBeVisible();
  } finally {
    await adminClient().auth.admin.deleteUser(user.id).catch(() => undefined);
  }
});
