import { test as base } from '@playwright/test';
import { seedContract } from '../helpers/factories';
import { adminClient } from '../helpers/session';
import { createUser, expect, PASSWORD } from './support';

// 01-auth.md §12 — signed-out flows against the local Auth server and Mailpit.
const test = base;
const MAILPIT = process.env.MAILPIT_URL ?? process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';
const cleanup: string[] = [];
test.afterAll(async () => {
  for (const id of cleanup) await adminClient().auth.admin.deleteUser(id).catch(() => undefined);
});

/** Polls Mailpit (≤ 10 s) for messages to `email`; returns the newest message's text. */
async function latestEmail(email: string, minCount = 1): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = (await res.json()) as { messages: { ID: string }[] };
    if (body.messages.length >= minCount) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${body.messages[0]!.ID}`)).json()) as { HTML: string; Text: string };
      return msg.HTML || msg.Text;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${email} within 10 s`);
}
const countEmails = async (email: string) =>
  ((await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages: unknown[] }).messages.length;

async function signInViaForm(page: import('@playwright/test').Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('sign up → verify by email → dashboard empty state', async ({ page }) => {
  const email = `e2e-signup-${Date.now()}@contractiq.test`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
  await expect(page.getByText(email)).toBeVisible();

  const html = await latestEmail(email);
  const link = /href="([^"]*\/auth\/callback\?[^"]*token_hash=[^"]+)"/.exec(html.replace(/&amp;/g, '&'))?.[1];
  expect(link, 'verification link in the email').toBeTruthy();
  const { search } = new URL(link!); // the template uses site_url; the test server runs on another port
  await page.goto(`/auth/callback${search}`);
  await expect(page).toHaveURL(/\/dashboard$/);
  // The spec's sentence is the empty state's accessible description; the visible copy is the heading + prompt.
  const empty = page.getByRole('region', { name: 'No contracts reviewed yet' });
  await expect(empty).toBeVisible();
  await expect(empty).toHaveAccessibleDescription('No contracts reviewed yet — upload your first contract to begin');
  await expect(page.getByRole('dialog', { name: 'Start here' })).toBeVisible(); // a brand-new account gets the first tip

  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  cleanup.push(data.users.find((u) => u.email === email)!.id);
});

test('duplicate sign-up → "An account with this email already exists"', async ({ page }) => {
  const user = await createUser();
  cleanup.push(user.id);
  await page.goto('/signup');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/An account with this email already exists/)).toBeVisible();
});

test('sign in → dashboard; sign out → /; dashboard is protected again', async ({ page }) => {
  const user = await createUser();
  cleanup.push(user.id);
  await page.goto('/login');
  await signInViaForm(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test('wrong password → "Incorrect email or password", no navigation', async ({ page }) => {
  const user = await createUser();
  cleanup.push(user.id);
  await page.goto('/login');
  await signInViaForm(page, user.email, 'WrongPassword1');
  await expect(page.getByText('Incorrect email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('unverified sign-in shows the verify banner; Resend sends a new email', async ({ page }) => {
  const user = await createUser({ confirmed: false, onboarded: false });
  cleanup.push(user.id);
  const before = await countEmails(user.email);
  await page.goto('/login');
  await signInViaForm(page, user.email, PASSWORD);
  await expect(page.getByText('Please verify your email — check your inbox for the link.')).toBeVisible();
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByText('Verification email sent.')).toBeVisible();
  await latestEmail(user.email, before + 1);
});

test('deep link: signed out → contract → sign in → lands on that contract', async ({ page }) => {
  const user = await createUser();
  cleanup.push(user.id);
  const contract = await seedContract(user.id, { file_name: 'Deep link NDA.pdf' });
  await page.goto(`/contracts/${contract.id}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fcontracts%2F${contract.id}$`));
  await signInViaForm(page, user.email, PASSWORD);
  await expect(page).toHaveURL(new RegExp(`/contracts/${contract.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Deep link NDA.pdf' })).toBeVisible();
});

test('open redirect: next=https://example.com → /dashboard after sign-in', async ({ page }) => {
  const user = await createUser();
  cleanup.push(user.id);
  await page.goto('/login?next=https://example.com');
  await signInViaForm(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
});

test('timing: sign-in submit → dashboard visible in < 10 s', async ({ page }) => {
  const user = await createUser();
  cleanup.push(user.id);
  await page.goto('/login');
  await signInViaForm(page, user.email, PASSWORD);
  await expect(page.getByRole('heading', { level: 1, name: 'Your contracts' })).toBeVisible({ timeout: 10_000 });
});
