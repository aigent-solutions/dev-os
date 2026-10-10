# 04 — Term Library, Pre-processing Preview & Custom Terms

## 1. Overview

**Builds:** the contract-type-specific term library (`TERM_LIBRARY`), the pre-processing preview card that lists the terms ContractIQ will look for, and the "+ Add Key Term" feature: up to 5 user-defined terms that are extracted with the same structure as standard terms.

**References:** PRD Flow 3 steps 2–3, US-005, FR-05, roadmap v0.3. Engineering doc §4.3 (step 5), §7.5, §8.2, F7.

**Depends on:** `00-foundation.md` (validation helpers, UI primitives), `supabase-schema.sql` (`custom_key_terms`, `trg_custom_terms_limit`), `03-upload-extraction.md` (the wizard that hosts the preview). Custom terms are persisted and extracted by `05-key-term-extraction.md`.

**Out of scope:** editing the library at runtime (it is code, versioned with the prompts), and per-user saved custom-term presets.

---

## 2. User flow

1. On `/contracts/new` the user picks a contract type (NDA or MSA). **Straight away**, before or during upload and extraction, `TermPreviewCard` shows the 10 NDA or 12 MSA standard terms in library order. Each name has a plain-English tooltip.
2. If the user changes the type, the standard list swaps. Custom terms already added are kept, unless one now duplicates a standard term name of the new type. That term is removed, and an inline notice says: "'{name}' is already a standard term for {NDA|MSA} and was removed from your custom terms."
3. The user clicks **"+ Add Key Term"**. An inline text input appears (autofocus), with Add and Cancel buttons and a counter "n/5".
4. The user types, e.g. "Non-compete radius", and presses Enter or clicks Add. Validation runs (§5.2). If valid, the term is appended to the list with a **"Custom"** badge and a remove (×) button.
5. At 5 custom terms the "+ Add Key Term" button is disabled and shows "Maximum 5 custom terms".
6. The user clicks **"Process Contract"** (owned by `05`). The custom terms are sent as `custom_terms: string[]` in the order shown. The server persists them in `custom_key_terms` and extracts them alongside the standard terms.
7. On the results page, custom terms appear after the standard terms, carry the "Custom" badge, and have the same value, page, confidence and "Why?" structure (`06`).

---

## 3. Database

| Table | Operation | Client | When |
|---|---|---|---|
| `custom_key_terms` | `DELETE … WHERE contract_id = $1`, then one `INSERT (contract_id, user_id, term_name)` per term, sequentially in request order | **User-scoped** (`requireUser().supabase`). RLS `custom_key_terms_insert_own` / `_delete_own` | Inside `POST /api/contracts/{id}/process`, after the status claim succeeds (see `05` §6.1 step 6) |
| `custom_key_terms` | `SELECT id, term_name FROM custom_key_terms WHERE contract_id = $1 ORDER BY created_at, id` | Service role inside `runExtraction` (ownership already established by `contracts.user_id = p_user_id`) | Building the requested-term list (`05`) |
| `custom_key_terms` | `SELECT id, term_name …` | User-scoped | `GET /api/contracts/{id}` returns `custom_terms` (used by Retry in `05`) |
| `key_terms` | Rows with `is_custom = true`, `term_key = custom_*`, `custom_key_term_id` set | Service role via `save_extraction_results` | End of extraction (`05`) |

Exact persistence code (inside `/process`, user client):

```ts
const { error: delError } = await supabase.from('custom_key_terms').delete().eq('contract_id', contractId);
if (delError) throw delError;
// One statement per row, in request order: created_at then reflects the user's order (§6.3).
for (const term_name of customTerms) {
  const { error } = await supabase
    .from('custom_key_terms')
    .insert({ contract_id: contractId, user_id: user.id, term_name });
  if (error) throw error; // 23514 (limit) or 23505 (duplicate) → mapped to VALIDATION_ERROR in 05 §6.1
}
```

The DELETE + INSERT makes retries idempotent. A retry from `error` re-sends the same list (the Retry button reads `custom_terms` from `GET /api/contracts/{id}`). Deleting `custom_key_terms` rows sets `key_terms.custom_key_term_id` to NULL (FK `ON DELETE SET NULL`). That is harmless, because `save_extraction_results` replaces all `key_terms` rows anyway.

---

## 4. Database tasks

Already present in `supabase-schema.sql`. Nothing new is required.

- [ ] `public.custom_key_terms` with `custom_key_terms_term_name_length CHECK (char_length(term_name) BETWEEN 2 AND 60)`.
- [ ] Unique index `uq_custom_terms_contract_name ON (contract_id, lower(term_name))`.
- [ ] Index `idx_custom_terms_contract`.
- [ ] Trigger `trg_custom_terms_limit` → `enforce_custom_term_limit()`. It raises SQLSTATE `23514` once the contract already has 5 rows, and locks the parent `contracts` row to serialise concurrent inserts.
- [ ] RLS policies `custom_key_terms_{select,insert,update,delete}_own`. Insert and update also require that the parent contract belongs to `auth.uid()`.

No seed data. The term library lives in code (`src/lib/ai/term-library.ts`), not in the database.

---

## 5. API routes

This spec adds **no new routes**. It defines the `custom_terms` contract that `POST /api/contracts/{id}/process` (`05` §5.1) accepts.

### 5.1 `custom_terms` request field

| Field | Type | Rules |
|---|---|---|
| `custom_terms` | `string[]` | Optional, default `[]`. 0–5 items. Each item is normalised (§5.2), then validated. Order is preserved and drives `display_order` |

### 5.2 Validation (`src/lib/validation/custom-terms.ts`)

```ts
import { z } from 'zod';
import { CUSTOM_TERM_MAX, CUSTOM_TERM_MIN, CUSTOM_TERM_PATTERN, MAX_CUSTOM_TERMS } from '@/lib/constants';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import type { ContractType } from '@/types/domain';

/** Trim, and collapse any run of whitespace to a single space. */
export function normaliseTermName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export const CustomTermNameSchema = z
  .string()
  .transform(normaliseTermName)
  .pipe(
    z.string()
      .min(CUSTOM_TERM_MIN, `Use at least ${CUSTOM_TERM_MIN} characters.`)
      .max(CUSTOM_TERM_MAX, `Use at most ${CUSTOM_TERM_MAX} characters.`)
      .regex(CUSTOM_TERM_PATTERN, "Use letters, numbers, spaces and , . ' & ( ) / - only."),
  );

/** Full list schema; the duplicate checks depend on the contract type. */
export function makeCustomTermsSchema(contractType: ContractType) {
  const standardNames = new Set(TERM_LIBRARY[contractType].map((t) => t.name.toLowerCase()));
  return z
    .array(CustomTermNameSchema)
    .max(MAX_CUSTOM_TERMS, `You can add up to ${MAX_CUSTOM_TERMS} custom terms.`)
    .superRefine((terms, ctx) => {
      const seen = new Set<string>();
      terms.forEach((name, i) => {
        const lower = name.toLowerCase();
        if (standardNames.has(lower)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: `"${name}" is already a standard term.` });
        }
        if (seen.has(lower)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: `"${name}" is already in your list.` });
        }
        seen.add(lower);
      });
    });
}
export type CustomTermsInput = z.infer<ReturnType<typeof makeCustomTermsSchema>>;
```

The same schema is used client-side (`AddCustomTermInput`, validating one candidate against the current list) and server-side (`/process`, validating the whole list after loading `contract_type`). Server failures → `400 VALIDATION_ERROR` with `details: { "custom_terms.<i>": "<message>" }`.

---

## 6. Backend implementation

### 6.1 `src/lib/ai/term-library.ts`

```ts
import type { ContractType } from '@/types/domain';
import { slugify } from '@/lib/utils';

export type TermDefinition = { key: string; name: string; description: string | null; extractionHint: string };
export type RequestedTerm = TermDefinition & { isCustom: boolean; customKeyTermId: string | null; displayOrder: number };

export const TERM_LIBRARY_VERSION = 'terms-v1.0'; // bump whenever keys, names or hints change
export const TERM_LIBRARY: Record<ContractType, TermDefinition[]> = { nda: [...], msa: [...] }; // §6.2
```

`TERM_LIBRARY` and `TermDefinition` are imported by client components (the preview), so this file must **not** import `server-only` or anything server-side.

### 6.2 Library content (exact)

#### NDA — 10 terms (display order 1–10)

| # | `key` | `name` | `description` (tooltip, plain English) | `extractionHint` (sent to the model) |
|---|---|---|---|---|
| 1 | `parties` | Parties | The people or companies signing the agreement, and which one is sharing confidential information. | Full legal names of every party, and each party's role (Disclosing Party, Receiving Party, or mutual). Include registered addresses or company numbers only if stated next to the names. |
| 2 | `effective_date` | Effective Date | The date the agreement starts to apply. | The exact date the agreement takes effect (e.g. "1 March 2026"), or the triggering event if no fixed date is given (e.g. "date of last signature"). |
| 3 | `confidentiality_obligations` | Confidentiality Obligations | What the receiving party must do to keep information secret. | Core duties of the receiving party: non-use beyond the stated purpose, non-disclosure, the required standard of care (e.g. "reasonable care"), and any limit on who inside the company may see the information. Summarise in one or two sentences. |
| 4 | `permitted_disclosures` | Permitted Disclosures | Situations where sharing the information is allowed. | Exceptions where disclosure is allowed: employees or advisers on a need-to-know basis, disclosures required by law, court or regulator (and any notice requirement), and information that is public, already known or independently developed. |
| 5 | `term_duration` | Term & Duration | How long the agreement lasts and how long secrecy must be kept. | The length of the agreement AND how long the confidentiality obligations survive after it ends (e.g. "2 years; obligations survive 5 years after termination"). Give exact numbers and units. |
| 6 | `governing_law` | Governing Law | Which country's or state's law applies to the agreement. | The jurisdiction whose law governs the agreement (e.g. "Laws of England and Wales", "State of Delaware"). |
| 7 | `jurisdiction` | Jurisdiction | Where any court case about the agreement would be heard. | The courts that have jurisdiction over disputes, and whether that is exclusive or non-exclusive (e.g. "Exclusive jurisdiction of the courts of New York County"). |
| 8 | `ip_ownership` | IP Ownership | Who owns the ideas, data and intellectual property that are shared. | Who owns the confidential information and any intellectual property in it; whether any licence is granted (usually "no licence granted"); and ownership of feedback or derivatives if stated. |
| 9 | `non_solicitation` | Non-Solicitation | Whether either side is banned from hiring or poaching the other's staff or clients. | Any restriction on soliciting or hiring the other party's employees, contractors or customers, with its duration and scope. Return null if there is no such clause. |
| 10 | `breach_remedy` | Breach & Remedy | What happens if someone breaks the agreement. | Consequences of breach: injunctive or equitable relief, indemnities, damages, liquidated damages, and obligations to return or destroy information. |

#### MSA — 12 terms (display order 1–12)

| # | `key` | `name` | `description` (tooltip) | `extractionHint` |
|---|---|---|---|---|
| 1 | `parties` | Parties | The companies or people entering the agreement, and who is the customer and who is the provider. | Full legal names of every party, and each party's role (Customer/Client, Supplier/Provider/Contractor). |
| 2 | `service_scope` | Service Scope | What services are being provided. | The services or deliverables the provider must supply, and whether detailed scope is set in separate Statements of Work or Order Forms. Summarise in one or two sentences. |
| 3 | `payment_terms` | Payment Terms | How much is paid and how quickly invoices must be paid. | Fees or the pricing basis (fixed, time-and-materials, per SOW), currency, and the payment deadline after invoice (e.g. "Net 30"). |
| 4 | `invoice_schedule` | Invoice Schedule | When the provider sends invoices. | How often and when invoices are issued (e.g. "monthly in arrears", "on milestone completion", "annually in advance"). |
| 5 | `late_payment_penalty` | Late Payment Penalty | Extra charges or consequences if you pay late. | Interest rate or fee on overdue amounts (e.g. "1.5% per month") and any right to suspend services for non-payment, with notice periods. |
| 6 | `liability_cap` | Liability Cap | The maximum amount either side can be made to pay if things go wrong. | The cap on each party's total liability (e.g. "fees paid in the 12 months preceding the claim"), any excluded loss types (indirect, consequential, lost profits), and carve-outs from the cap. |
| 7 | `indemnification` | Indemnification | Who must cover the other's costs if certain claims arise (for example IP infringement). | Which party indemnifies the other, for which claims (e.g. third-party IP infringement, data breach, negligence), and the procedure or conditions if stated. |
| 8 | `ip_ownership` | IP Ownership | Who owns the work product and existing intellectual property. | Ownership of deliverables and work product (assigned to customer or retained by provider), treatment of pre-existing or background IP, and any licence granted. |
| 9 | `termination_clause` | Termination Clause | How and when either side can end the agreement. | Termination for convenience (who, notice period), termination for cause or material breach (cure period), insolvency triggers, and effects of termination. Include any auto-renewal and the opt-out deadline. |
| 10 | `governing_law` | Governing Law | Which country's or state's law applies to the agreement. | The jurisdiction whose law governs the agreement. |
| 11 | `dispute_resolution` | Dispute Resolution | How disagreements are resolved (courts, arbitration or mediation). | The dispute process: negotiation or escalation steps, mediation, arbitration (body, seat, rules), or courts, including any exclusive venue. |
| 12 | `notice_period` | Notice Period | How much warning must be given, and how formal notices must be sent. | The notice period required for termination or non-renewal, and how formal notices must be delivered (email, post, addresses). If several notice periods exist, give the termination notice period first. |

### 6.3 `buildRequestedTerms`

```ts
export function customTermKey(name: string): string {
  const slug = slugify(name);           // lowercase, [a-z0-9_], max 50 (README §3.4)
  return `custom_${slug || 'term'}`;
}

export function buildRequestedTerms(
  type: ContractType,
  custom: { id: string; term_name: string }[],
): RequestedTerm[] {
  const standard = TERM_LIBRARY[type].map((t, i) => ({
    ...t, isCustom: false, customKeyTermId: null, displayOrder: i + 1,
  }));
  const usedKeys = new Set(standard.map((t) => t.key));
  const customTerms = custom.map((c, i) => {
    const base = customTermKey(c.term_name);
    let key = base;
    for (let n = 2; usedKeys.has(key); n++) key = `${base}_${n}`;
    usedKeys.add(key);
    return {
      key,
      name: c.term_name,
      description: null,
      extractionHint: 'User-requested term. Extract the clause that best matches this name.',
      isCustom: true,
      customKeyTermId: c.id,
      displayOrder: standard.length + i + 1,
    };
  });
  return [...standard, ...customTerms];
}
```

**Key rules**

- Standard keys are fixed (§6.2).
- A custom key is `custom_` + `slugify(name)`. A name whose slug is empty (e.g. only non-Latin letters such as "競業避止") becomes `custom_term`.
- **Collisions** (two names with the same slug, e.g. "Non-compete" and "Non compete", or two non-Latin names) are resolved deterministically in list order by appending `_2`, `_3`, …. Custom keys always start with `custom_`, so they can never collide with a standard key.
- **Order:** `custom` must be passed in the order the user entered the terms. Persistence (§3) inserts **one row per statement, sequentially, in request order**. Each PostgREST call is its own transaction, so each row gets a later `created_at` (`now()` is the transaction start time). `runExtraction` reads them back with `ORDER BY created_at, id`, which reproduces the user's order. `id` is only a tiebreaker and never matters in practice.

---

## 7. State management

`useUploadWizardStore` (README §3.10) holds `contractType` and `customTerms: string[]`. Additional actions are defined here:

```ts
addCustomTerm(name: string): { ok: true } | { ok: false; message: string };
  // normalise, then validate with makeCustomTermsSchema(contractType).safeParse([...customTerms, name]);
  // on success append the normalised name
removeCustomTerm(index: number): void;
setContractType(type: ContractType): string[];
  // sets the type, removes custom terms that duplicate the new type's standard names,
  // and returns the removed names (used for the inline notice)
```

Rules:

- Custom terms can be added in steps `select`, `uploading`, `extracting` and `ready`. They are frozen (input and remove buttons disabled) in step `processing`.
- No server state. Nothing is persisted until `/process`.
- `TERM_LIBRARY` is imported statically. No fetch is needed for the preview.

---

## 8. Components

All under `src/components/upload/`, all `"use client"`.

### 8.1 `TermPreviewCard`

Root element carries `data-onboarding="term-preview"` (onboarding tooltip anchor, `14-onboarding-a11y.md`).

| Prop | Type | Notes |
|---|---|---|
| `contractType` | `ContractType \| null` | `null` → card shows the placeholder "Choose a contract type to see the terms we'll extract." |
| `customTerms` | `string[]` | From the store |
| `onAdd` | `(name: string) => { ok: boolean; message?: string }` | Store `addCustomTerm` |
| `onRemove` | `(index: number) => void` | |
| `locked` | `boolean` | True while processing |
| `notice` | `string \| null` | The type-switch removal notice (§2 step 2). Dismissible |

Layout:

- Section Block pattern: heading "Terms we'll look for" (H5), subtext "{n} standard terms for {NDA|MSA} · {m}/5 custom".
- `<ul>` of `TermPreviewItem`: standard terms first, then custom.
- `AddCustomTermInput` below the list.

### 8.2 `TermPreviewItem`

| Prop | Type |
|---|---|
| `name` | `string` |
| `description` | `string \| null` |
| `isCustom` | `boolean` |
| `onRemove?` | `() => void` (custom only) |
| `disabled` | `boolean` |

- Standard: the name followed by an info icon (`lucide Info`, `aria-hidden`) wrapped in a Radix `Tooltip` showing `description`. The trigger is a `<button type="button" aria-label="What is {name}?">`, so the tooltip opens on focus as well as hover.
- Custom: the name, a "Custom" badge (Semantic Status Badge, Violet accent tint per design system), and an × button (`aria-label="Remove custom term {name}"`).

### 8.3 `AddCustomTermInput`

| Prop | Type |
|---|---|
| `count` | `number` |
| `onAdd` | `(name: string) => { ok: boolean; message?: string }` |
| `disabled` | `boolean` |

Behaviour:

- **Collapsed:** a ghost button "+ Add Key Term". Disabled with a helper "Maximum 5 custom terms" when `count >= 5`.
- **Expanded:** an `<input>` (`maxLength={60}`, `aria-describedby` for the counter and the error), with "Add" (primary, small) and "Cancel" (ghost) buttons.
  - Enter = Add. Escape = Cancel (collapses and restores focus to the "+ Add Key Term" button).
  - On success the input clears and **stays open** for quick multiple entry, unless the count reaches 5, in which case it collapses.
  - On error, an inline message appears below the field (`role="alert"`), the field gets `aria-invalid="true"`, and the text is kept.
- **Placeholder:** "e.g. Non-compete radius".
- **Counter:** "{count}/5" in Paragraph Small.

---

## 9. Design

- **Card:** surface White, border Grey 50 (divider), radius per `docs/design.md` Border Radius Rules (card), padding on the 4 px grid (24 px).
- **Heading:** H5 / Medium 24/32 Grey 900. Subtext: Paragraph Small 12/18 Grey 500.
- **List items:** Paragraph Large / Medium 16/24 Grey 900, 8 px vertical gap, Grey 50 divider between items.
- **"Custom" badge:** Semantic Status Badge pattern (`docs/design.md` Reusable Patterns), Violet 50 background with Violet 700 text, Paragraph Small.
- **Add button:** ghost style with Blue 500 text. Input focus ring Blue 500. Error text Red 500 on Red 50 tint (Paragraph Small).
- Use only the Tailwind token classes defined in `00-foundation.md` §9. No raw hex values.

---

## 10. Edge cases

| Condition | Behaviour |
|---|---|
| Name < 2 or > 60 characters after normalisation | Inline error ("Use at least 2 characters." / "Use at most 60 characters."). The input's `maxLength` stops typing past 60 |
| Name contains disallowed characters (e.g. `<`, `{`, `"`, newline, emoji) | Inline error with the allowed set. Server rejects with 400 if the client is bypassed. This is also the prompt-injection guard (engineering doc §8.8) |
| Duplicate of an existing custom term (case-insensitive, after whitespace normalisation) | "'{name}' is already in your list." |
| Same name as a standard term of the selected type (case-insensitive) | "'{name}' is already a standard term." |
| Contract type switched and a custom term now duplicates a standard name | The term is removed, with the notice in §2 step 2 |
| A 6th term is attempted (UI bypassed) | Server `400 VALIDATION_ERROR` (Zod `max(5)`). If that check were bypassed too, the DB trigger raises `23514`, which `05` maps to `400 VALIDATION_ERROR` |
| Two custom names produce the same slug | Keys get `_2`, `_3` suffixes (§6.3). Display names stay as typed |
| Name with only non-Latin letters | Allowed by `\p{L}`. Key becomes `custom_term` (plus a suffix if needed) |
| Retry after an error | The Retry button re-sends `custom_terms` from `GET /api/contracts/{id}`. DELETE + INSERT keeps the result identical |
| User adds terms, then leaves the page before processing | Nothing is persisted. The `pending_upload` or `ready` row is cleaned by the sweep (`13`) |

---

## 11. Acceptance criteria

- [ ] Selecting NDA shows exactly the 10 NDA terms in §6.2 order. Selecting MSA shows exactly the 12 MSA terms.
- [ ] Every standard term has a tooltip with its description, reachable by keyboard focus.
- [ ] Up to 5 custom terms can be added. Each appears with a "Custom" badge and can be removed. A 6th is impossible from the UI.
- [ ] Duplicate, too-short, too-long and invalid-character names are rejected with the messages in §5.2, both client-side and server-side.
- [ ] After processing, every custom term appears in results with value or "Not found", page, confidence and source sentence (same structure as standard terms), in the order entered, after the standard terms.
- [ ] `custom_key_terms` holds one row per custom term with `is_manual = true` (FR-05).
- [ ] The DB rejects a 6th row for the same contract and a case-insensitive duplicate.

---

## 12. Tests

**Unit (Vitest)** — `tests/unit/lib/ai/term-library.test.ts`, `tests/unit/lib/validation/custom-terms.test.ts`, `tests/unit/components/upload/*.test.tsx`

- `TERM_LIBRARY.nda` has 10 entries and `msa` has 12. Keys are unique per type and match `^[a-z_]+$`. Every entry has a non-empty `description` and `extractionHint`.
- `customTermKey`: "Non-compete radius" → `custom_non_compete_radius`. "競業避止" → `custom_term`.
- `buildRequestedTerms`: standard first with `displayOrder` 1..n. Custom follow in input order. Collision suffixes `_2`, `_3`. `customKeyTermId` is set.
- `makeCustomTermsSchema`: boundaries 1/2/60/61 characters, the regex (accepts `R&D (EU/UK)`, rejects `<script>`), standard-name duplicates per type, case-insensitive self-duplicates, max 5. `normaliseTermName("  a   b ")` → `"a b"`.
- `AddCustomTermInput`: Enter adds and Escape cancels, counter updates, disabled at 5, error has `role="alert"`.
- `TermPreviewCard`: swaps the list on type change. `setContractType` removes conflicting custom terms and shows the notice.

**Integration** — `tests/integration/custom-terms.test.ts` (local Supabase)

- `/process` with 5 valid terms → 5 `custom_key_terms` rows with `is_manual = true`.
- `/process` with 6 terms → 400. A direct DB insert of a 6th row as the user → error `23514`.
- A direct user insert into another user's contract → RLS violation.
- A retry from `error` with the same terms → still 5 rows, new IDs.

**E2E** — covered by `contract-review.spec.ts` (`05`/`06`): add 2 custom terms, then verify both appear in results with the "Custom" badge.
