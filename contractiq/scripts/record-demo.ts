// Records the landing-page demo (02-landing.md §6): public/demo.gif (1200×750, ≤ 20 s loop, ≤ 3 MB),
// public/demo-poster.png (its first frame) and public/og-image.png (1200×630).
// Run through the local runner so it never touches a hosted project or OpenAI:
//   npm run db:start && npm run demo:record
// Flow: upload the synthetic demo NDA → term preview → results → click a page → chat answer with a citation.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PDF = path.join(ROOT, 'tests/fixtures/pdfs/demo-nda-4p.pdf');
const W = 1200;
const H = 750;
const MAX_LOOP_MS = 20_000;
const MAX_BYTES = 3 * 1024 * 1024;
const FRAME_EVERY_MS = 250;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) throw new Error(`Refusing to record against a non-local Supabase (${url}). Use npm run demo:record.`);
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type Frame = { png: Buffer; at: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Screenshots every FRAME_EVERY_MS until stopped. */
function startCapture(page: Page) {
  const frames: Frame[] = [];
  let running = true;
  const done = (async () => {
    while (running) {
      const t = Date.now();
      try {
        frames.push({ png: await page.screenshot({ type: 'png' }), at: t });
      } catch {
        return; // page closed after a failure elsewhere; that error is the one to report
      }
      await sleep(Math.max(0, FRAME_EVERY_MS - (Date.now() - t)));
    }
  })();
  return { frames, stop: async () => ((running = false), done) };
}

/** Drops consecutive duplicates (their time goes to the previous frame) and scales to ≤ MAX_LOOP_MS. */
function timeline(frames: Frame[], endHoldMs: number): { png: Buffer; delayMs: number }[] {
  const out: { png: Buffer; delayMs: number }[] = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.at ?? f.at + endHoldMs;
    const delay = next - f.at;
    const prev = out.at(-1);
    if (prev && prev.png.equals(f.png)) prev.delayMs += delay;
    else out.push({ png: f.png, delayMs: delay });
  });
  const total = out.reduce((s, f) => s + f.delayMs, 0);
  const scale = total > MAX_LOOP_MS ? MAX_LOOP_MS / total : 1;
  return out.map((f) => ({ ...f, delayMs: Math.max(20, Math.round((f.delayMs * scale) / 10) * 10) }));
}

function encodeGif(frames: { png: Buffer; delayMs: number }[], colors: number): Buffer {
  const gif = GIFEncoder();
  for (const f of frames) {
    const { data, width, height } = PNG.sync.read(f.png);
    const palette = quantize(data, colors);
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: f.delayMs });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}

async function main() {
  // A throwaway demo user, onboarding already done so no tips cover the UI.
  const email = `demo-${Date.now()}@contractiq.test`;
  const password = 'DemoPassword123';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw error;
  const userId = created.user.id;
  await admin.from('profiles').update({ onboarding_completed_at: new Date().toISOString(), full_name: 'Demo' }).eq('id', userId);

  const browser = await chromium.launch();
  let failureArtifacts: (() => Promise<void>) | null = null;
  try {
    const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference' })).newPage();
    const consoleErrors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
    failureArtifacts = async () => {
      writeFileSync(path.join(tmpdir(), 'ciq-demo-failure.png'), await page.screenshot({ type: 'png' }));
      console.error('Page console errors:', consoleErrors.slice(-5));
    };
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard');
    await page.goto(`${BASE}/contracts/new`);
    await page.getByRole('combobox', { name: 'Contract type' }).waitFor();
    await sleep(500);

    const capture = startCapture(page);
    await sleep(900);
    await page.getByRole('combobox', { name: 'Contract type' }).click();
    await sleep(500);
    await page.getByRole('option', { name: /NDA/ }).click();
    await sleep(1600); // term preview
    await page.locator('input[type="file"]').setInputFiles(PDF);
    const processButton = page.getByRole('button', { name: 'Process Contract' });
    await processButton.waitFor();
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Process Contract'));
      return !!b && !b.disabled;
    }, undefined, { timeout: 30_000 });
    await sleep(900);
    await processButton.click();
    await page.waitForURL(/\/contracts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await page.getByRole('list', { name: 'Key terms' }).waitFor({ timeout: 30_000 });
    await sleep(2000); // results panel
    await page.getByRole('button', { name: 'Go to page 4' }).first().click();
    await sleep(1800); // viewer jumps to page 4
    await page.getByRole('tab', { name: /Chat/ }).first().click();
    await sleep(600);
    const box = page.getByRole('textbox', { name: 'Ask a question about this contract' });
    await box.pressSequentially('How can either party end this agreement?', { delay: 25 });
    await box.press('Enter');
    await page.getByRole('button', { name: 'Go to page 3 in the document' }).first().waitFor({ timeout: 30_000 });
    await sleep(1500);
    await capture.stop();

    let frames = timeline(capture.frames, 2500);
    let colors = 256;
    let gif = encodeGif(frames, colors);
    while (gif.length > MAX_BYTES && colors > 32) {
      colors /= 2;
      gif = encodeGif(frames, colors);
    }
    if (gif.length > MAX_BYTES) {
      frames = frames.filter((_, i) => i % 2 === 0).map((f) => ({ ...f, delayMs: f.delayMs * 2 }));
      gif = encodeGif(frames, colors);
    }
    if (process.env.DEMO_FRAMES_DIR) {
      // Optional: every distinct frame as a PNG, for reviewing a recording.
      mkdirSync(process.env.DEMO_FRAMES_DIR, { recursive: true });
      frames.forEach((f, i) => writeFileSync(path.join(process.env.DEMO_FRAMES_DIR!, `frame-${String(i).padStart(3, '0')}.png`), f.png));
    }
    mkdirSync(PUBLIC, { recursive: true });
    writeFileSync(path.join(PUBLIC, 'demo.gif'), gif);
    writeFileSync(path.join(PUBLIC, 'demo-poster.png'), frames[0]!.png);

    // Social image: the landing hero at 1200×630, signed out.
    const og = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
    await og.goto(BASE);
    await og.getByRole('heading', { level: 1 }).waitFor();
    await og.waitForFunction(() => [...document.images].every((i) => i.complete));
    writeFileSync(path.join(PUBLIC, 'og-image.png'), await og.screenshot({ type: 'png' }));

    const total = frames.reduce((s, f) => s + f.delayMs, 0);
    console.log(`demo.gif: ${frames.length} frames, ${(total / 1000).toFixed(1)} s loop, ${colors} colours, ${(gif.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`demo-poster.png: ${(statSync(path.join(PUBLIC, 'demo-poster.png')).size / 1024).toFixed(0)} KB · og-image.png: ${(statSync(path.join(PUBLIC, 'og-image.png')).size / 1024).toFixed(0)} KB`);
    const sizeOk = readFileSync(path.join(PUBLIC, 'demo.gif')).length <= MAX_BYTES;
    if (!sizeOk || total > MAX_LOOP_MS) throw new Error('demo.gif exceeds the 3 MB / 20 s budget');
  } catch (e) {
    await failureArtifacts?.().catch(() => undefined); // screenshot → $TMPDIR/ciq-demo-failure.png
    throw e;
  } finally {
    await browser.close();
    await admin.auth.admin.deleteUser(userId); // the demo contract and its object cascade / are swept
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
