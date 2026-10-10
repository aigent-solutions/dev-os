'use client';

import { create } from 'zustand';
import { makeCustomTermsSchema, normaliseTermName } from '@/lib/validation/custom-terms';
import type { ContractType } from '@/types/domain';
import { TERM_LIBRARY } from '@/lib/ai/term-library';

// Upload wizard state (README §3.10, 03 §7, 04 §7). Nothing is persisted until /process.
export type WizardStep = 'select' | 'uploading' | 'extracting' | 'ready' | 'processing';
export type WizardError = { code: string; message: string };

type State = {
  step: WizardStep;
  contractType: ContractType | null;
  file: File | null;
  contractId: string | null;
  uploadProgress: number;
  pageCount: number | null;
  customTerms: string[];
  error: WizardError | null;
};

type Actions = {
  setStep(step: WizardStep): void;
  setFile(file: File | null): void;
  setContractId(id: string | null): void;
  setUploadProgress(p: number): void;
  setPageCount(n: number | null): void;
  setError(e: WizardError | null): void;
  /** Sets the type; removes custom terms that duplicate the new type's standard names; returns them. */
  setContractType(type: ContractType): string[];
  addCustomTerm(name: string): { ok: true } | { ok: false; message: string };
  removeCustomTerm(index: number): void;
  /** After an error or "Choose another file": keeps contractType and customTerms. */
  resetFile(): void;
  reset(): void;
};

const initial: State = {
  step: 'select',
  contractType: null,
  file: null,
  contractId: null,
  uploadProgress: 0,
  pageCount: null,
  customTerms: [],
  error: null,
};

export const useUploadWizardStore = create<State & Actions>()((set, get) => ({
  ...initial,
  setStep: (step) => set({ step }),
  setFile: (file) => set({ file }),
  setContractId: (contractId) => set({ contractId }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setPageCount: (pageCount) => set({ pageCount }),
  setError: (error) => set({ error }),
  setContractType: (type) => {
    const standard = new Set(TERM_LIBRARY[type].map((t) => t.name.toLowerCase()));
    const removed = get().customTerms.filter((t) => standard.has(t.toLowerCase()));
    set({ contractType: type, customTerms: get().customTerms.filter((t) => !standard.has(t.toLowerCase())) });
    return removed;
  },
  addCustomTerm: (name) => {
    const { contractType, customTerms } = get();
    if (!contractType) return { ok: false, message: 'Choose a contract type first.' };
    const candidate = normaliseTermName(name);
    const r = makeCustomTermsSchema(contractType).safeParse([...customTerms, candidate]);
    if (!r.success) {
      const last = r.error.issues.find((i) => i.path[0] === customTerms.length) ?? r.error.issues[0];
      return { ok: false, message: last?.message ?? 'Invalid term name.' };
    }
    set({ customTerms: r.data });
    return { ok: true };
  },
  removeCustomTerm: (index) => set({ customTerms: get().customTerms.filter((_, i) => i !== index) }),
  resetFile: () => set({ file: null, contractId: null, uploadProgress: 0, pageCount: null, step: 'select' }),
  reset: () => set(initial),
}));
