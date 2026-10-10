import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as extractRoute from '@/app/api/contracts/[id]/extract/route';
import * as contractsRoute from '@/app/api/contracts/route';
import { closeDb, count, sql } from '../helpers/db';
import { createTestUser, deleteTestUser, seedContract } from '../helpers/factories';
import { callRoute, signedInClient } from '../helpers/supabase';
import type { SeededUser } from '../setup/seed-users';

// 03-upload-extraction.md §12 — create → upload (user client, Storage RLS) → extract, on the local stack.
const fixture = (name: string) => readFileSync(path.join(__dirname, '../fixtures/pdfs', name));
const created: string[] = [];
const fresh = async () => {
  const u = await createTestUser();
  created.push(u.id);
  return u;
};
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

async function create(user: SeededUser, fileName: string, size: number) {
  const res = await callRoute(contractsRoute.POST, { method: 'POST', path: '/api/contracts', body: { file_name: fileName, file_size: size, contract_type: 'nda' }, user });
  return { res, body: (await res.json()) as { contract_id: string; storage_bucket: string; storage_path: string } };
}
async function upload(user: SeededUser, storagePath: string, buf: Buffer) {
  const { error } = await (await signedInClient(user)).storage.from('contracts').upload(storagePath, buf, { contentType: 'application/pdf' });
  return error;
}
const extract = (user: SeededUser, id: string) => callRoute(extractRoute.POST, { method: 'POST', path: `/api/contracts/${id}/extract`, params: { id }, user });
const objectCount = (p: string) => count(`select count(*) from storage.objects where bucket_id = 'contracts' and name = $1`, [p]);
const rowCount = (id: string) => count('select count(*) from public.contracts where id = $1', [id]);

/** create + upload `name`; returns ids for the extract step. */
async function uploaded(name: string) {
  const user = await fresh();
  const buf = fixture(name);
  const { body } = await create(user, `Upload ${name}`, buf.length);
  expect(await upload(user, body.storage_path, buf)).toBeNull();
  return { user, id: body.contract_id, storagePath: body.storage_path };
}

describe('happy path', () => {
  it('create → upload → extract: row ready with all counts; object at {user}/{id}/…', async () => {
    const { user, id, storagePath } = await uploaded('nda-3p.pdf');
    expect(storagePath).toMatch(new RegExp(`^${user.id}/${id}/[a-z0-9_]+\\.pdf$`));
    const res = await extract(user, id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ contract_id: id, status: 'ready', page_count: 3 });
    expect(body.word_count).toBeGreaterThan(100);
    expect(body.token_count).toBeGreaterThan(0);
    const [row] = await sql<{ status: string; page_count: number; contract_text: string }>('select status, page_count, contract_text from public.contracts where id = $1', [id]);
    expect(row).toMatchObject({ status: 'ready', page_count: 3 });
    expect(row!.contract_text).toContain('[PAGE 3]');
    expect(await objectCount(storagePath)).toBe(1);
  });
});

describe('rejections delete the row and the object', () => {
  it.each([
    ['msa-21p.pdf', 'TOO_MANY_PAGES'],
    ['scanned-1p.pdf', 'SCANNED_PDF'],
    ['encrypted.pdf', 'PDF_ENCRYPTED'],
    ['too-long-20p.pdf', 'CONTRACT_TOO_LONG'],
    ['not-a-pdf.pdf', 'NOT_A_PDF'],
    ['corrupt.pdf', 'PDF_UNREADABLE'],
  ])('%s → 422 %s', async (name, code) => {
    const { user, id, storagePath } = await uploaded(name);
    const res = await extract(user, id);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
    expect(await rowCount(id)).toBe(0);
    expect(await objectCount(storagePath)).toBe(0);
  }, 30_000);

  it('object never uploaded → PDF_UNREADABLE and the row is cleaned up', async () => {
    const user = await fresh();
    const { body } = await create(user, 'never.pdf', 1000);
    const res = await extract(user, body.contract_id);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('PDF_UNREADABLE');
    expect(await rowCount(body.contract_id)).toBe(0);
  });
});

describe('guards', () => {
  it('extract on a ready contract → 409', async () => {
    const { user, id } = await uploaded('nda-3p.pdf');
    expect((await extract(user, id)).status).toBe(200);
    expect((await extract(user, id)).status).toBe(409);
  });

  it("another user extracting → 404, and the owner's row is untouched", async () => {
    const { id } = await uploaded('nda-3p.pdf');
    expect((await extract(await fresh(), id)).status).toBe(404);
    expect(await rowCount(id)).toBe(1);
  });

  it('POST /api/contracts with file_size 10,485,761 → 413 and no row', async () => {
    const user = await fresh();
    const { res } = await create(user, 'big.pdf', 10_485_761);
    expect(res.status).toBe(413);
    expect(await count('select count(*) from public.contracts where user_id = $1', [user.id])).toBe(0);
  });
});

describe('server-managed columns and Storage RLS (user client)', () => {
  const denied = (e: { code?: string } | null) => e?.code === '42501';

  it('cannot insert a row with status ready', async () => {
    const user = await fresh();
    const { error } = await (await signedInClient(user)).from('contracts').insert({ user_id: user.id, file_name: 'a.pdf', file_size_bytes: 1, contract_type: 'nda', status: 'ready' } as never);
    expect(denied(error)).toBe(true);
  });

  it("cannot insert a file_path in another user's folder", async () => {
    const user = await fresh();
    const id = randomUUID();
    const { error } = await (await signedInClient(user)).from('contracts').insert({ id, user_id: user.id, file_name: 'a.pdf', file_size_bytes: 1, contract_type: 'nda', file_path: `${randomUUID()}/${id}/a.pdf` });
    expect(denied(error)).toBe(true);
  });

  it('cannot update contract_text', async () => {
    const user = await fresh();
    const c = await seedContract(user.id);
    const { error } = await (await signedInClient(user)).from('contracts').update({ contract_text: '[PAGE 1]\nforged' } as never).eq('id', c.id);
    expect(denied(error)).toBe(true);
  });

  it("cannot upload into another user's folder", async () => {
    const [victim, attacker] = [await fresh(), await fresh()];
    const error = await upload(attacker, `${victim.id}/${randomUUID()}/x.pdf`, fixture('nda-3p.pdf'));
    expect(error).not.toBeNull();
  });
});
