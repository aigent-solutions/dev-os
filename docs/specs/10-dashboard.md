# 10 — Dashboard & Contract History

## 1. Overview

**Builds:** The signed-in home page `/dashboard`: summary cards (total contracts, NDA count, MSA count), the 5 most recent contracts, a sortable, filterable, paginated table of all contracts, an empty state for new users, and per-row delete. Clicking a row opens the contract's results page.

**References:** PRD US-008, FR-10, Flow 1 step 4, Flow 2, North Star metric (reviewed status). Engineering doc §4.1 step 5, §4.2, §4.5, §5.3, §7.4, §7.12 (`get_dashboard_summary`), §9.2 (`GET /api/contracts`), §9.6.

**Depends on:** `00-foundation.md` (layout, API layer, query client), `01-auth.md` (session), `supabase-schema.sql` (`contracts`, `key_terms`, `get_dashboard_summary`, `idx_contracts_user_created`, `idx_contracts_user_type`), `13-data-lifecycle-gdpr.md` (owns `DELETE /api/contracts/{id}`, `DeleteContractDialog`, `useDeleteContract`), `14-onboarding-a11y.md` (onboarding tooltips mounted on this page).

**Out of scope:** Analytics charts (Phase 2), search by text, bulk actions.

---

## 2. User flow

1. Authenticated user lands on `/dashboard` (after sign-in, email verification or via the nav).
2. Server component loads the summary and the first page of the table using URL search params (defaults: `sort=created_at&order=desc&page=1`).
3. **No contracts:** the page shows `EmptyState` — "No contracts reviewed yet — upload your first contract to begin" with a **Review a Contract** button → `/contracts/new`. Summary cards and table are not rendered.
4. **Has contracts:** the page shows the header with **Review a Contract** (primary), `DashboardSummaryCards` (Total · NDA · MSA), `RecentContractsList` (last 5 with status and date) and `ContractsTable`.
5. User clicks a column header (Name, Type, Uploaded) → sort toggles asc/desc; URL updates (`router.replace`, no scroll jump); the table refetches through `GET /api/contracts`.
6. User picks a type filter (All / NDA / MSA) → `type` param set, `page` reset to 1.
7. User pages with **Previous** / **Next** → `page` param changes.
8. User clicks a row (or presses Enter on the focused row link) → `/contracts/{id}`, which renders progress, error or results depending on status.
9. User opens a row's **⋯** menu → **Delete** → `DeleteContractDialog` (13) → confirm → `DELETE /api/contracts/{id}` → toast "Contract deleted"; row disappears; summary and recent list refresh.

---

## 3. Database

All reads use the **user-scoped** client (RLS restricts rows to `auth.uid()`); no service role on this page.

| Purpose | Query (supabase-js) |
|---|---|
| Summary counts | `supabase.rpc('get_dashboard_summary').single()` → `{ total, nda_count, msa_count, completed_count, reviewed_count }` (bigint → `Number()`) |
| Recent 5 | `supabase.from('contracts').select('id, file_name, contract_type, status, review_completed_at, created_at').neq('status', 'pending_upload').order('created_at', { ascending: false }).limit(5)` |
| Table page | `supabase.from('contracts').select('id, file_name, contract_type, status, page_count, created_at, review_completed_at', { count: 'exact' }).neq('status', 'pending_upload')` + optional `.eq('contract_type', type)` + `.order(sort, { ascending: order === 'asc' })` + `.order('id', { ascending: true })` (stable tiebreak) + `.range((page-1)*page_size, page*page_size - 1)` |
| Low-confidence counts for the page | `supabase.from('key_terms').select('contract_id').in('contract_id', pageIds).lt('confidence_score', 50)` → count per `contract_id` in code; contracts with no rows get `0`. Skipped when `pageIds` is empty. At most 50 contracts × 17 terms = 850 rows, under PostgREST's default 1,000-row cap |

Indexes used: `idx_contracts_user_created` (default sort, recent 5), `idx_contracts_user_type` (type filter and counts), `idx_key_terms_contract_order` (prefix `contract_id` for the `in` lookup).

`contract_text` is never selected on this page.

---

## 4. Database tasks

None new. Requires from `supabase-schema.sql`: `contracts` + RLS `contracts_select_own`, `key_terms` + `key_terms_select_own`, function `get_dashboard_summary()` (SECURITY INVOKER, executable by `authenticated`), indexes listed above.

---

## 5. API routes

### 5.1 `GET /api/dashboard/summary`

| Field | Value |
|---|---|
| File | `src/app/api/dashboard/summary/route.ts` |
| Auth | `requireUser()` |
| Rate limit | none |
| Response `200` | `{ "total": number, "by_type": { "nda": number, "msa": number }, "reviewed": number, "recent": [{ "id": string, "file_name": string, "contract_type": "nda" \| "msa", "status": ContractStatus, "review_completed_at": string \| null, "created_at": string }] }` |
| Errors | `401 UNAUTHORIZED`, `500 INTERNAL_ERROR` |

`recent` items include `review_completed_at` (in addition to the engineering-doc fields) so the status pill can show "Reviewed".

### 5.2 `GET /api/contracts`

| Field | Value |
|---|---|
| File | `src/app/api/contracts/route.ts` (`GET`; `POST` is specified in `03-upload-extraction.md`) |
| Auth | `requireUser()` |
| Rate limit | none |
| Query | `ListContractsQuerySchema` (below) |
| Response `200` | `{ "items": [{ "id", "file_name", "contract_type", "status", "page_count", "created_at", "review_completed_at", "low_confidence_count" }], "page": number, "page_size": number, "total": number }` |
| Errors | `400 VALIDATION_ERROR` (unknown sort/order/type, page < 1, page_size outside 1–50), `401` |

```ts
// src/lib/validation/contract.ts
export const LIST_SORT_COLUMNS = ['created_at', 'file_name', 'contract_type'] as const;
export const ListContractsQuerySchema = z.object({
  sort: z.enum(LIST_SORT_COLUMNS).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  type: z.enum(['nda', 'msa']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListContractsQuery = z.infer<typeof ListContractsQuerySchema>;
```

`sort` is passed to `.order()` only after Zod's enum check (whitelist), never raw from the URL. A `page` beyond the last page returns `items: []` with the correct `total`; the UI then navigates to the last page.

---

## 6. Backend implementation

### 6.1 Files

| File | Purpose |
|---|---|
| `src/app/(app)/dashboard/page.tsx` | Server component |
| `src/app/(app)/dashboard/loading.tsx` | Skeleton |
| `src/app/api/dashboard/summary/route.ts` | Summary route |
| `src/app/api/contracts/route.ts` | `GET` list (this spec) + `POST` (03) |
| `src/server/services/dashboard.service.ts` | `getDashboardSummary` |
| `src/server/services/contracts.service.ts` | `listContracts` |

### 6.2 `getDashboardSummary(supabase): Promise<DashboardSummary>`

```ts
const [{ data: s, error: e1 }, { data: recent, error: e2 }] = await Promise.all([
  supabase.rpc('get_dashboard_summary').single(),
  supabase.from('contracts')
    .select('id, file_name, contract_type, status, review_completed_at, created_at')
    .neq('status', 'pending_upload').order('created_at', { ascending: false }).limit(5),
]);
if (e1 || e2) throw appError('INTERNAL_ERROR');
return { total: Number(s.total), by_type: { nda: Number(s.nda_count), msa: Number(s.msa_count) },
         reviewed: Number(s.reviewed_count), recent: recent ?? [] };
```

### 6.3 `listContracts(supabase, q: ListContractsQuery): Promise<ListContractsResponse>`

1. Build the table-page query (§3); await `{ data, count, error }`; error → `INTERNAL_ERROR`.
2. `ids = data.map(r => r.id)`; if non-empty run the low-confidence query; build `Map<contractId, number>`.
3. Return `{ items: data.map(r => ({ ...r, low_confidence_count: map.get(r.id) ?? 0 })), page: q.page, page_size: q.page_size, total: count ?? 0 }`.

### 6.4 Route handlers

```ts
// src/app/api/dashboard/summary/route.ts
export const runtime = 'nodejs';
export const GET = withApiHandler(async () => {
  const { supabase } = await requireUser();
  return Response.json(await getDashboardSummary(supabase));
});

// src/app/api/contracts/route.ts (GET)
export const GET = withApiHandler(async (req) => {
  const { supabase } = await requireUser();
  const q = parseQuery(req, ListContractsQuerySchema);
  return Response.json(await listContracts(supabase, q));
});
```

### 6.5 Server component — `src/app/(app)/dashboard/page.tsx`

```tsx
export const dynamic = 'force-dynamic';
export default async function DashboardPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = createServerSupabase();               // (app)/layout already redirected if signed out
  const parsed = ListContractsQuerySchema.safeParse(flattenSearchParams(searchParams));
  const query = parsed.success ? parsed.data : ListContractsQuerySchema.parse({}); // invalid params → defaults
  const [summary, list] = await Promise.all([getDashboardSummary(supabase), listContracts(supabase, query)]);
  if (summary.total === 0) return <><DashboardHeader /><EmptyState /></>;
  return (
    <>
      <DashboardHeader />
      <DashboardSummaryCards initialData={summary} />
      <RecentContractsList initialData={summary.recent} />
      <ContractsTable initialQuery={query} initialData={list} />
    </>
  );
}
```

`flattenSearchParams` takes the first value of array params. Services are called directly (no HTTP hop); client components then own refetching through the API routes.

---

## 7. State management

| Hook | Query key | Fetches | Options |
|---|---|---|---|
| `useDashboardSummary(initialData)` | `qk.dashboardSummary()` | `GET /api/dashboard/summary` | `initialData`, `staleTime: 30_000`, `refetchOnWindowFocus: true` |
| `useContracts(query, initialData?)` | `qk.contracts(query)` | `GET /api/contracts?…` | `initialData` only when `query` equals the server query; `placeholderData: keepPreviousData` (no flash while sorting/paging); `staleTime: 30_000` |
| `useDeleteContract()` | — (mutation, defined in 13) | `DELETE /api/contracts/{id}` | On success: `invalidateQueries({ queryKey: ['contracts'] })`, `invalidateQueries({ queryKey: qk.dashboardSummary() })`, `removeQueries({ queryKey: qk.contract(id) })` |

**URL as state:** `ContractsTable` reads `useSearchParams()`, parses with `ListContractsQuerySchema.safeParse` (fallback defaults) and writes with `router.replace(pathname + '?' + params, { scroll: false })`. Default values are omitted from the URL. Changing `sort`, `order` or `type` resets `page` to 1.

**Polling:** if any visible row has `status = 'processing'`, `useContracts` sets `refetchInterval: 5_000` until none are processing.

No Zustand store on this page.

---

## 8. Components

`src/components/dashboard/` unless noted.

```
DashboardPage (server)
├── DashboardHeader                (title "Your contracts" + Review a Contract button)
├── EmptyState                     (total === 0)
├── DashboardSummaryCards          (client)
├── RecentContractsList            (client)
└── ContractsTable                 (client)
    ├── ContractsTableToolbar      (type filter, result count)
    ├── ContractStatusPill
    ├── ContractRowMenu → DeleteContractDialog (13)
    └── TablePagination
```

| Component | Props | Behaviour & states |
|---|---|---|
| `DashboardHeader` | none | `<h1>` "Your contracts"; primary button **Review a Contract** → `/contracts/new` (also the onboarding tooltip anchor `data-onboarding="review-cta"`) |
| `EmptyState` | none | Illustration-free card: heading "No contracts reviewed yet", body "Upload your first contract to begin.", primary **Review a Contract** button. Exact PRD copy is the combined sentence "No contracts reviewed yet — upload your first contract to begin", used as the card's accessible description |
| `DashboardSummaryCards` | `{ initialData: DashboardSummary }` | 3 cards: **Total contracts**, **NDAs**, **MSAs**; value uses H5 (24/32 500), label Paragraph Small. Uses the "Labeled Value Row"/"Data Label Pair" pattern. Loading: 3 skeleton cards. Error: cards keep last data; toast "Couldn't refresh your summary" |
| `RecentContractsList` | `{ initialData: RecentContract[] }` (reads `useDashboardSummary`) | Up to 5 rows: file name (truncated with full name in `title`), type badge, `ContractStatusPill`, relative date ("2 days ago", absolute date in `<time dateTime>` + tooltip). Each row is a link to `/contracts/{id}` |
| `ContractsTable` | `{ initialQuery: ListContractsQuery; initialData: ListContractsResponse }` | Semantic `<table>` with `<caption class="sr-only">Contract history</caption>`. Columns: **Name** (sortable), **Type** (sortable), **Status**, **Low-confidence terms** (number; "—" if not completed; amber/red badge when > 0), **Uploaded** (sortable, `created_at`), actions. Sortable headers are `<button>`s inside `<th aria-sort="ascending|descending|none">`. Row click navigates; the file name cell is a real `<Link>` (keyboard/AT path); the row's `onClick` ignores clicks originating inside the actions menu. Loading (refetch): previous data with 50% opacity + `aria-busy`. Error: inline row "Couldn't load contracts" + **Try again** |
| `ContractsTableToolbar` | `{ type: 'nda' \| 'msa' \| undefined; total: number; onTypeChange(t): void }` | Segmented control/Select "All · NDA · MSA"; text "{total} contracts" |
| `ContractStatusPill` | `{ status: ContractStatus; reviewCompletedAt: string \| null }` | Mapping below; Semantic Status Badge pattern; text always visible (never color-only) |
| `ContractRowMenu` | `{ contractId: string; fileName: string }` | Radix `DropdownMenu` trigger `aria-label="Actions for {fileName}"`; items: **Open**, **Delete** (danger) → opens `DeleteContractDialog` |
| `TablePagination` | `{ page: number; pageSize: number; total: number; onPageChange(p): void }` | "Showing {from}–{to} of {total}"; **Previous**/**Next** buttons disabled at bounds; hidden when `total ≤ pageSize` |

**Status pill mapping** (`ContractStatusPill`):

| Condition | Label | Token |
|---|---|---|
| `status = 'completed'` and `review_completed_at` set | Reviewed | success (green) |
| `status = 'completed'` | Ready to review | primary (blue) |
| `status = 'processing'` | Analysing… | neutral (grey) with spinner icon (static if reduced motion) |
| `status = 'error'` | Needs retry | danger (red) |
| `status = 'ready'` | Not analysed | warning (yellow) |
| `status = 'pending_upload'` | — (never shown; excluded by queries) | — |

---

## 9. Design

- Page wrapper and section blocks per `docs/design.md` "Page Wrapper" / "Section Block" patterns; max content width per Layout Structure; 24 px vertical gap between sections (4 px grid).
- Summary cards: Flex-Wrap Item Grid; 3 columns ≥ 1024 px, 1 column < 768 px.
- Table: grey-100 row dividers, grey-50 hover row background, focus ring token on the focused row link; header text Paragraph Small 12/18 in grey-500, sentence case.
- Responsive < 768 px: the table becomes a stacked list (each row a card: name, type badge, status pill, date, menu); sorting moves into a "Sort by" Select in the toolbar.
- Colors only through semantic tokens; badges follow "Semantic Status Badge".

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| New user, 0 contracts | `EmptyState` only |
| User has only `pending_upload` rows (abandoned uploads) | Treated as 0 contracts (both summary and list exclude `pending_upload`) → `EmptyState` |
| Invalid URL params (`?sort=password&page=-3`) | Server page falls back to defaults; client rewrites the URL to defaults; the API itself returns `400` for direct calls |
| `page` beyond last page (e.g. after deleting the last row on a page) | Client detects `items.length === 0 && total > 0` → `onPageChange(Math.ceil(total / page_size))` |
| Contract processing while on dashboard | Row shows "Analysing…"; list polls every 5 s until it changes |
| Delete fails | Toast with the error catalog message; row stays (mutation is not optimistic) |
| Deleting the only contract | Summary invalidation → `total = 0` → `router.refresh()` renders `EmptyState` |
| Very long file names | Truncated with ellipsis; full name in `title` and in the link's accessible name |
| Sorting by name with mixed case | Postgres default collation ordering; acceptable for MVP |
| Two tabs open, contract deleted in one | Other tab refetches on focus; clicking a stale row → results page `not-found.tsx` |
| Another user's data | Never visible: all queries go through RLS |

---

## 11. Acceptance criteria

- [ ] `/dashboard` shows total contracts, NDA count and MSA count (FR-10).
- [ ] The last 5 contracts appear with status and date (Flow 2).
- [ ] The table lists every non-`pending_upload` contract with name, type, upload date and status (US-008).
- [ ] Sorting by date, name and type works in both directions and is reflected in the URL; type filter and pagination work.
- [ ] Clicking any row opens `/contracts/{id}` (US-008).
- [ ] New users see "No contracts reviewed yet — upload your first contract to begin" and a **Review a Contract** button.
- [ ] Deleting a contract from the row menu removes it from the table and updates the summary.
- [ ] Contracts with completed review show "Reviewed".
- [ ] The page renders in < 1 s (server, P95) for a user with 500 contracts; no `contract_text` is transferred.
- [ ] axe: 0 serious/critical violations; table sortable headers expose `aria-sort`; all actions keyboard reachable.

---

## 12. Tests

**Unit**
- `ListContractsQuerySchema`: defaults; coercion of `page`; rejects `sort=password`, `page_size=51`.
- `ContractStatusPill.test.tsx`: each mapping row.
- `ContractsTable.test.tsx`: clicking a header toggles `order` and resets `page`; `aria-sort` values; menu click does not navigate.
- `TablePagination.test.tsx`: bounds disable buttons; "Showing x–y of z".

**Integration (local Supabase)**
- `GET /api/dashboard/summary` with 3 NDAs + 2 MSAs (1 reviewed, 1 `pending_upload` extra) → `total 5, nda 3, msa 2, reviewed 1`, `recent` length 5 newest first, no `pending_upload`.
- `GET /api/contracts?sort=file_name&order=asc&type=nda&page=2&page_size=2` → correct slice, `total` = NDA count.
- `low_confidence_count` equals the number of `key_terms` with `confidence_score < 50` per contract.
- `GET /api/contracts?sort=user_id` → `400 VALIDATION_ERROR`.
- User B sees none of user A's contracts in either route.

**E2E (`dashboard.spec.ts`)**
- New user → empty state → CTA → `/contracts/new`.
- Seeded user: sort by name asc/desc, filter NDA, paginate, click row → results page.
- Delete via row menu → toast, row gone, summary decremented.
