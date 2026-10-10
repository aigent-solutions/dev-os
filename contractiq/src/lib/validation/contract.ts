import { z } from 'zod';
import { MAX_CUSTOM_TERMS } from '@/lib/constants';

// POST /api/contracts (03-upload-extraction.md §5.1). The file_size upper bound is checked separately → 413.
export const CreateContractSchema = z.object({
  file_name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.pdf$/i, 'File must be a .pdf'),
  file_size: z.number().int().min(1),
  contract_type: z.enum(['nda', 'msa']),
});
export type CreateContractInput = z.infer<typeof CreateContractSchema>;

// POST /api/contracts/{id}/process (05-key-term-extraction.md §5.1). Names are validated against the
// contract type with makeCustomTermsSchema once the contract is loaded.
export const ProcessContractBodySchema = z.object({
  custom_terms: z.array(z.string()).max(MAX_CUSTOM_TERMS).default([]),
});
export type ProcessContractBody = z.infer<typeof ProcessContractBodySchema>;

// PATCH /api/contracts/{id} (06 §5.2). file_name is the display name only; Storage paths never change.
export const ContractUpdateSchema = z
  .object({
    review_completed: z.boolean().optional(),
    file_name: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .refine((v) => v.review_completed !== undefined || v.file_name !== undefined, {
    message: 'Provide review_completed or file_name',
  });
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;

// GET /api/contracts (10-dashboard.md §5.2). `sort` reaches .order() only after this whitelist.
export const LIST_SORT_COLUMNS = ['created_at', 'file_name', 'contract_type'] as const;
export const ListContractsQuerySchema = z.object({
  sort: z.enum(LIST_SORT_COLUMNS).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  type: z.enum(['nda', 'msa']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListContractsQuery = z.infer<typeof ListContractsQuerySchema>;
