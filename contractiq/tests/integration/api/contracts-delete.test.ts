import { http, HttpResponse } from 'msw';
import { afterAll, describe, expect, it } from 'vitest';
import { DELETE } from '@/app/api/contracts/[id]/route';
import { allZero, contractLeftovers, usageRowsDetached } from '../../helpers/cascade';
import { closeDb, count } from '../../helpers/db';
import { contractPath, createTestUser, deleteTestUser, seedContract, seedContractChildren, uploadObject } from '../../helpers/factories';
import { adminClient, callRoute } from '../../helpers/supabase';
import { server } from '../../setup/msw';

// 13-data-lifecycle-gdpr.md §12 — DELETE /api/contracts/{id}: Storage object, then the row and everything under it.
const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map(deleteTestUser));
  await closeDb();
});

async function ownerWithContract(overrides = {}) {
  const user = await createTestUser();
  created.push(user.id);
  const c = await seedContract(user.id, overrides);
  return { user, contractId: c.id };
}

async function withObject(userId: string, contractId: string) {
  await uploadObject(contractPath(userId, contractId));
  const { error } = await adminClient().from('contracts').update({ file_path: contractPath(userId, contractId) }).eq('id', contractId);
  if (error) throw error;
}

const del = (contractId: string, user?: Awaited<ReturnType<typeof createTestUser>>) =>
  callRoute(DELETE, { method: 'DELETE', path: `/api/contracts/${contractId}`, params: { id: contractId }, user });

describe('DELETE /api/contracts/{id}', () => {
  it('owner → 204; the row, its children and the PDF are gone; usage logs are kept and detached', async () => {
    const { user, contractId } = await ownerWithContract();
    await withObject(user.id, contractId);
    const { usageId } = await seedContractChildren(contractId, user.id);
    const res = await del(contractId, user);
    expect(res.status).toBe(204);
    expect(await contractLeftovers(contractId, user.id)).toEqual(allZero(await contractLeftovers(contractId, user.id)));
    expect(await usageRowsDetached([usageId])).toBe(1);
  });

  it('another user → 404 and nothing is deleted', async () => {
    const { user, contractId } = await ownerWithContract();
    await withObject(user.id, contractId);
    const other = await createTestUser();
    created.push(other.id);
    const res = await del(contractId, other);
    expect(res.status).toBe(404);
    const left = await contractLeftovers(contractId, user.id);
    expect(left.contracts).toBe(1);
    expect(left.storage_objects).toBe(1);
  });

  it('a pending_upload row (no text, no file) is deletable', async () => {
    const { user, contractId } = await ownerWithContract({ status: 'pending_upload', contract_text: null, page_count: null, word_count: null, token_count: null });
    const res = await del(contractId, user);
    expect(res.status).toBe(204);
    expect(await count('select count(*) from public.contracts where id = $1', [contractId])).toBe(0);
  });

  it('Storage unavailable → still 204 (row deleted); the object remains for the orphan sweep', async () => {
    const { user, contractId } = await ownerWithContract();
    await withObject(user.id, contractId);
    server.use(http.delete(/\/storage\/v1\/object\/contracts$/, () => HttpResponse.json({ error: 'unavailable' }, { status: 503 })));
    const res = await del(contractId, user);
    server.resetHandlers();
    expect(res.status).toBe(204);
    const left = await contractLeftovers(contractId, user.id);
    expect(left.contracts).toBe(0);
    expect(left.storage_objects).toBe(1);
  });

  it('a second delete → 404', async () => {
    const { user, contractId } = await ownerWithContract();
    expect((await del(contractId, user)).status).toBe(204);
    expect((await del(contractId, user)).status).toBe(404);
  });
});
