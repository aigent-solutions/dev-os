'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import type { ContractDetail, KeyTermUpdateResult } from '@/types/api';
import type { KeyTerm } from '@/types/domain';

export type KeyTermEditVars = { termId: string; value: string; page_number?: number | null };

/** Mirrors the preserve_original_term_value trigger so the optimistic state matches the server (08 §7.1). */
export function applyLocalEdit(t: KeyTerm, v: KeyTermEditVars): KeyTerm {
  const pageChanged = v.page_number !== undefined && v.page_number !== t.page_number;
  if (v.value === t.value && !pageChanged) return t;
  const captureOriginal = t.original_value === null && !t.is_edited;
  return {
    ...t,
    value: v.value,
    page_number: v.page_number !== undefined ? v.page_number : t.page_number,
    is_edited: true,
    original_value: captureOriginal ? t.value : t.original_value,
    original_page_number: captureOriginal ? t.page_number : t.original_page_number,
    edited_at: new Date().toISOString(),
  };
}

/**
 * Optimistic term edit. Rolls back on error. Doesn't invalidate the contract query: a refetch would
 * re-sign the PDF URL and could reset editor state.
 */
export function useUpdateKeyTerm(contractId: string) {
  const qc = useQueryClient();
  const key = qk.contract(contractId);
  return useMutation({
    mutationFn: ({ termId, ...body }: KeyTermEditVars) =>
      apiFetch<KeyTermUpdateResult>(`/api/key-terms/${termId}`, { method: 'PATCH', json: body }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ContractDetail>(key);
      qc.setQueryData<ContractDetail>(key, (d) =>
        d ? { ...d, key_terms: d.key_terms.map((t) => (t.id !== vars.termId ? t : applyLocalEdit(t, vars))) } : d,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (res) => {
      qc.setQueryData<ContractDetail>(key, (d) =>
        d ? { ...d, key_terms: d.key_terms.map((t) => (t.id === res.id ? { ...t, ...res } : t)) } : d,
      );
    },
  });
}
