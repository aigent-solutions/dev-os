import { readFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { buildPdf } from '../fixtures/pdfs/pdf-builder';
import { DEMO_NDA_PAGES } from '../fixtures/pdfs/demo-nda';
import { adminClient, sessionCookies } from '../helpers/session';
import type { SeededUser } from '../setup/seed-users';

// Shared E2E support: a fresh signed-in user per test, real-API contract seeding, mock overrides, axe.
export const PASSWORD = 'Password123';
export const DEMO_PDF = path.join(__dirname, '../fixtures/pdfs/demo-nda-4p.pdf');
export const fixturePdf = (name: string) => path.join(__dirname, '../fixtures/pdfs', name);
const MOCK = 'http://localhost:4010';

export async function createUser(opts: { onboarded?: boolean; confirmed?: boolean } = {}): Promise<SeededUser> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@contractiq.test`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: opts.confirmed ?? true });
  if (error || !data.user) throw error;
  if (opts.onboarded ?? true) await adminClient().from('profiles').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', data.user.id);
  return { id: data.user.id, email, password: PASSWORD };
}

export async function signIn(context: BrowserContext, user: SeededUser, baseURL: string) {
  const { hostname, protocol } = new URL(baseURL);
  await context.addCookies(
    (await sessionCookies(user)).map((c) => ({ ...c, domain: hostname, path: '/', httpOnly: false, secure: protocol === 'https:', sameSite: 'Lax' as const })),
  );
}

type Fixtures = { user: SeededUser; userOptions: { onboarded?: boolean } };

/** `user` is a fresh, signed-in, onboarded account (override with test.use({ userOptions: { onboarded: false } })). */
export const test = base.extend<Fixtures>({
  userOptions: [{ onboarded: true }, { option: true }],
  user: async ({ context, baseURL, userOptions }, use) => {
    const user = await createUser(userOptions);
    await signIn(context, user, baseURL!);
    await use(user);
    await adminClient().auth.admin.deleteUser(user.id).catch(() => undefined);
  },
});
export { expect };

/**
 * A completed contract through the real API: create → upload to Storage → extract → process (sync mode,
 * OpenAI mock). `pdf` defaults to the demo NDA; pass a Buffer for a one-off PDF.
 */
export async function seedCompletedContract(page: Page, user: SeededUser, opts: { pdf?: Buffer; name?: string; customTerms?: string[] } = {}) {
  const buf = opts.pdf ?? readFileSync(DEMO_PDF);
  const created = await page.request.post('/api/contracts', { data: { file_name: opts.name ?? 'Demo NDA.pdf', file_size: buf.length, contract_type: 'nda' } });
  expect(created.status(), await created.text()).toBe(201);
  const { contract_id, storage_path } = (await created.json()) as { contract_id: string; storage_path: string };
  const { error } = await adminClient().storage.from('contracts').upload(storage_path, buf, { contentType: 'application/pdf' });
  if (error) throw error;
  const extracted = await page.request.post(`/api/contracts/${contract_id}/extract`);
  expect(extracted.status(), await extracted.text()).toBe(200);
  const processed = await page.request.post(`/api/contracts/${contract_id}/process`, { data: { custom_terms: opts.customTerms ?? [] } });
  expect(processed.status(), await processed.text()).toBe(200);
  expect(((await processed.json()) as { status: string }).status).toBe('completed');
  void user;
  return contract_id;
}

/** The demo NDA with an extra line holding `token`, so a mock override can target just this test. */
export function demoPdfWithToken(token: string): Buffer {
  const pages = DEMO_NDA_PAGES.map((p) => [...p]);
  pages[3]!.push('', `Reference ${token}.`);
  return buildPdf(pages.map((lines) => ({ lines })));
}

export async function mockOverride(page: Page, o: { match: string; kind: 'chat' | 'extraction'; status?: number; times?: number; text?: string }) {
  const res = await page.request.post(`${MOCK}/__mock/override`, { data: o });
  expect(res.status()).toBe(204);
}

/** axe with the WCAG 2.1 A/AA tags; fails on serious or critical violations only (14 §12). */
export async function expectNoSeriousA11yViolations(page: Page, label: string, opts: { disableRules?: string[] } = {}) {
  // Scan the settled UI: mid-fade (e.g. a dialog's enter animation) axe measures blended, too-light colours.
  // Infinite animations (spinners, skeleton pulse) never finish and don't fade content, so they're ignored.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(opts.disableRules ?? []).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), `axe on ${label}`).toEqual([]);
}

export const uniqueToken = () => `TOKEN${Date.now()}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
