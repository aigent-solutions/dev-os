import { expect, expectNoSeriousA11yViolations, test } from './support';

// 02-landing.md §12.
test.describe('signed out', () => {
  test('hero, then both CTAs go to signup and login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Understand any NDA or MSA in minutes — not hours' })).toBeVisible();
    await page.getByRole('main').getByRole('link', { name: 'Get Started Free' }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
    await page.goBack();
    await page.getByRole('main').getByRole('link', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('exactly one h1, the not-legal-advice notice and the footer attribution', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('ContractIQ is an AI-assisted review tool, not legal advice.', { exact: false })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByText('Powered by OpenAI GPT-4o')).toBeVisible();
  });

  test('axe: no serious or critical violations', async ({ page }) => {
    await page.goto('/');
    await expectNoSeriousA11yViolations(page, '/');
  });

  test('320 × 640: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('reduced motion shows the still poster instead of the GIF', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const img = page.getByRole('img', { name: /^Demo:/ });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/\/demo-poster\.png$/);
  });

  test('the GIF plays when motion is allowed, and both media files load', async ({ page, request }) => {
    await page.goto('/');
    await expect.poll(() => page.getByRole('img', { name: /^Demo:/ }).evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(/\/demo\.gif$/);
    for (const asset of ['/demo.gif', '/demo-poster.png', '/og-image.png']) expect((await request.get(asset)).status(), asset).toBe(200);
  });

  test('/terms and /privacy are placeholder pages, not indexed', async ({ page }) => {
    for (const p of ['/terms', '/privacy']) {
      await page.goto(p);
      await expect(page.getByText('This page will be published before public launch.')).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
  });
});

test.describe('signed in', () => {
  test('/ redirects to /dashboard, and the footer attribution is there too', async ({ page, user }) => {
    void user;
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('contentinfo').getByText('Powered by OpenAI GPT-4o')).toBeVisible();
  });
});
