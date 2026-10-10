# 15 — AI Evaluation Harness

## 1. Overview

**Builds:** the offline evaluation harness in `evals/`. It measures the AI against the PRD's quality targets, writes the PRD evaluation spreadsheet as CSV, and enforces CI gates.

| Eval | Script | PRD / engineering-doc target |
|---|---|---|
| Key-term extraction F1 (30 NDA + 20 MSA) | `run-extraction-eval.ts` | ≥ 88% NDA, ≥ 85% MSA at launch. ≥ 82% for beta (§13.5, PRD §10, §11 launch criteria) |
| Page attribution accuracy | `run-extraction-eval.ts` | ≥ 92% |
| Custom-term extraction F1 (10 terms × 15 contracts) | `run-extraction-eval.ts --custom` | ≥ 80% |
| Cost and latency per analysis | `run-extraction-eval.ts` | Mean ≤ $0.20 extraction cost. P95 ≤ 30 s at launch (≤ 45 s beta) |
| Confidence calibration (10 buckets) | `run-calibration-eval.ts` | Every bucket within 0.10. A gap ≥ 0.15 → turn on the UI calibration warning |
| Chat groundedness regression (20 off-document + 20 in-document) | `run-chat-groundedness.ts` | 100% "cannot find" on off-document questions. ≥ 95% of in-document answers cite a page |
| Expert chat review (50 Q&A, monthly) | Manual, using the CSV template from `run-chat-groundedness.ts --expert-template` | ≤ 5% hallucinated |

**References:**
- Engineering doc: §1.5, §8.3, §8.4, §8.8, §13.5, §13.6, §14 (`15-evals.md` row).
- PRD: §10 Evaluation Strategy, §11 Launch Criteria.

**Depends on:** `04-term-preview-custom-terms.md` (`TERM_LIBRARY`, `buildRequestedTerms`), `05-key-term-extraction.md` (`callExtractionModel`, `postProcessTerms`, prompt modules), `09-contract-chat.md` (`buildChatMessages`, `streamChatCompletion`, `parseCitations`, `classifyQuery`), `03-upload-extraction.md` (`extractPdfText`), `12-rate-limiting-usage.md` (`calculateCostUsd`).

**Key principle:** evals call **the same library functions** the app uses (§6.4). They never touch Supabase. They don't write `ai_usage_logs`, and they never import `src/server/services/*`.

---

## 2. User flow (engineer / CI)

1. An engineer changes a prompt or post-processing code under `src/lib/ai/**`.
2. Locally: `npm run eval:extraction -- --subset smoke --live` gives quick feedback against 10 contracts.
3. They open a PR. CI runs the **replay** suite (deterministic, free) and the **live smoke** suite (10 contracts + 40 chat questions). The gates in §6.9 block the merge on regression.
4. Nightly on `main`: the full live suite runs, recordings are refreshed, and reports are uploaded as artifacts.
5. When a release tag `v*` is pushed: the full live suite runs with the stage gate (`beta` or `launch`). A failure blocks the deploy job.
6. Monthly: the calibration eval runs. If any bucket's gap is ≥ 0.15, the workflow fails and opens a GitHub issue telling the team to set `NEXT_PUBLIC_SHOW_CALIBRATION_WARNING=true` in Netlify.
7. A legal SME fills in the `Expert_Rating` column of the CSV report (and the expert chat template) for the monthly audit.

---

## 3. Database

**None.** The harness has no DB access by design. Contract text comes from dataset files, and results go to `evals/reports/`.

---

## 4. Database tasks

**None.**

---

## 5. API routes

**None.** The harness is a set of CLI scripts.

---

## 6. Backend implementation

### 6.1 Directory layout

```
evals/
├── README.md                          # how to run, how to add a labelled contract
├── tsconfig.json                      # extends root; includes ../src for path alias @/
├── datasets/                          # git submodule → private repo contractiq-eval-data (see §6.2)
│   ├── nda/
│   │   └── nda-001/
│   │       ├── contract.pdf           # OR contract.txt (already contains [PAGE N] markers)
│   │       └── labels.json
│   ├── msa/
│   │   └── msa-001/ …
│   ├── custom-terms/
│   │   └── manifest.json              # 15 contract ids + labels for the 10 custom terms
│   ├── chat/
│   │   └── groundedness.json          # 40 questions
│   └── subsets.json                   # { "smoke": ["nda-001", …10 ids], "full": "all" }
├── recordings/                        # inside the submodule too (responses contain verbatim contract text)
│   └── <prompt_version>/<model>/<request_hash>.json
├── lib/
│   ├── env-setup.ts                   # must be the first import in every script (§6.3)
│   ├── load-dataset.ts                # read + validate labels with Zod
│   ├── openai-eval-client.ts          # live | replay | record client (§6.5)
│   ├── normalise.ts                   # text / number / date / duration normalisers
│   ├── match.ts                       # term matching rules (§6.6)
│   ├── metrics.ts                     # precision/recall/F1, page accuracy, calibration, percentiles
│   ├── judge.ts                       # optional LLM judge (§6.6.3)
│   └── report.ts                      # CSV + summary.json + summary.md writers
├── run-extraction-eval.ts
├── run-calibration-eval.ts
├── run-chat-groundedness.ts
└── reports/                           # git-ignored; <ISO timestamp>/…
```

### 6.2 Data handling

- Real contracts and SME labels are confidential. `evals/datasets/` is a **git submodule** pointing at the private repository `contractiq-eval-data`. Recordings live inside it as well, because model responses quote contract sentences word for word.
- CI checks out the submodule with the GitHub Actions secret `EVAL_DATA_DEPLOY_KEY` (a read-only deploy key). It is a CI secret, not an app environment variable, so it is not in `.env.example`.
- Contracts derived from CUAD (public) may be included alongside the SME-labelled set. `labels.json → source` records which is which.
- `evals/reports/` is git-ignored. CI uploads reports as workflow artifacts with 30-day retention.

### 6.3 Environment and module loading

- Modules reachable from evals use `@/lib/server-guard` rather than `server-only` (README §3.11), so they load in plain Node. The `react-server` condition is kept as a safeguard:
  `NODE_OPTIONS=--conditions=react-server tsx --env-file=.env.local evals/run-extraction-eval.ts …`
  The npm scripts in §6.8 bake this in.
- `evals/lib/env-setup.ts` runs before any `@/` import. For every variable `src/lib/env.ts` requires that evals don't use, it sets a placeholder if the variable is unset: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (`http://eval.invalid`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `INTERNAL_FUNCTION_SECRET` (32 × `x`), `OPENAI_USER_HASH_SALT` (32 × `e`), `OPENAI_MONTHLY_BUDGET_USD` (`0`), `NEXT_PUBLIC_APP_URL` (`http://eval.invalid`).
- `OPENAI_API_KEY` is required **only** in live or record mode. Replay mode sets the placeholder `sk-replay`. The model, price and prompt-version variables use the same defaults as the app (README §3.1).
- `EVAL_USE_LIVE_OPENAI` (`.env.example`): `true` → live by default, `false` or unset → replay by default. The CLI flags `--live` and `--replay` override it.

### 6.4 Reusing app code (no DB)

| Step | Function (same as the app) | Source spec |
|---|---|---|
| PDF → text with `[PAGE N]` markers | `extractPdfText(buf)` (skipped when `contract.txt` exists) | 03 |
| Enforce app limits | `countTokens(text) ≤ MAX_CONTRACT_TOKENS`, `pageCount ≤ MAX_PAGES`, `wordCount ≥ MIN_WORDS`. A dataset contract that fails these is a **dataset error** (the script exits 2) | 03, README §3.5 |
| Requested terms | `buildRequestedTerms(type, custom)` with synthetic custom ids `eval-custom-<n>` | 04 |
| Model call | `callExtractionModel(...)` with the eval client injected (§6.5) and the active `EXTRACTION_PROMPT_VERSION` | 05 |
| Post-processing | `postProcessTerms(...)`: confidence scaling, source verification, page re-derivation, caps, fill-missing | 05 |
| Chat prompt | `classifyQuery(question)`, `buildChatMessages({ version, contractType, contractText, queryType, history: [], question, maxInputTokens })` | 09 |
| Chat call | `streamChatCompletion(...)` with the eval client injected. Deltas are concatenated | 09 |
| Citation parsing | `parseCitations(text, pageCount, queryType)` | 09 |
| Cost | `calculateCostUsd(promptTokens, completionTokens)` | 12 |

**Required seam:** `callExtractionModel` and `streamChatCompletion` must accept an optional `client?: OpenAI` argument (default `getOpenAI()`). That lets the harness inject the replay or record client without network access. This is the only change evals need in app code.

The harness does **not** call `runExtraction` or `streamChatAnswer`: those are DB-bound services.

### 6.5 Eval OpenAI client — `evals/lib/openai-eval-client.ts`

```ts
export type EvalMode = 'live' | 'replay' | 'record';
export function createEvalClient(mode: EvalMode, opts: { promptVersion: string; model: string }): OpenAI;
```

- **Request hash:** `sha256(stableStringify({ model, messages, response_format, temperature, max_tokens }))`. It covers the full prompt, so any change to the prompt, few-shot examples, term list or contract text produces a new hash.
- **live:** forwards to a real `OpenAI` client (`maxRetries: 0`, because the app's own `withRetry` handles retries). Records nothing.
- **record:** live, then writes `recordings/<promptVersion>/<model>/<hash>.json`:
  ```json
  { "request_hash": "…", "recorded_at": "2026-10-09T…Z", "latency_ms": 8123,
    "response": { /* full chat.completions response; for streams: the concatenated text + usage */ } }
  ```
- **replay:** reads the recording for the hash and returns it as a completed response. For streaming calls it yields the text as a single delta, then usage. If the recording is missing it throws `ReplayMissError(hash)`. The script counts misses and handles them according to §6.9.
- `user` is always `'eval'`, and `store: false`.

### 6.6 Matching rules — `evals/lib/match.ts`, `normalise.ts`

#### 6.6.1 Normalisation (applies to every comparison)

`normaliseText(s)`:
1. Unicode NFKC, then lowercase.
2. Curly quotes → straight, `&` → `and`, every dash variant → `-`.
3. Remove quote characters `"'`.
4. Collapse whitespace, then trim.
5. Strip trailing `.,;:`.
6. Remove a leading `the ` or `a `.

#### 6.6.2 Match types (set per labelled term by `match_type`)

| `match_type` | Rule — the AI value matches when… | Typical terms |
|---|---|---|
| `exact_normalised` | `normaliseText(expected_value)`, or any normalised entry of `acceptable_variants`, is a substring of `normaliseText(ai_value)` | `governing_law`, `jurisdiction`, `parties` (one label entry per party, see below) |
| `numeric` | The multiset of `parseAmounts(value)` equals the expected one. `parseAmounts` reads currency symbols and codes (`$`→USD, `£`→GBP, `€`→EUR), thousands separators and scale words (`thousand`, `million`/`m`, `billion`/`bn`), and percentages (`1.5%` or `1.5 percent` → `{value: 1.5, unit: '%'}`). Amounts compare numerically with tolerance `1e-6` and identical units | `liability_cap`, `late_payment_penalty`, `payment_terms` (amount part) |
| `duration` | `parseDuration(value)` converts to days (`day`=1, `week`=7, `month`=30, `year`=365, plus number words one–twenty and "thirty-six"). Equal day counts match. If the label has `survives_termination: true`, the AI value must also mention survival (`/surviv/`) | `term_duration`, `notice_period`, `non_solicitation` |
| `date` | `parseDate(value)` tries `date-fns` formats `d MMMM yyyy`, `MMMM d, yyyy`, `yyyy-MM-dd`, `dd/MM/yyyy`, `MM/dd/yyyy` (UK format first when `jurisdiction` starts with `UK`, US first otherwise). Equal ISO dates match. A relative date ("the date of last signature") uses `exact_normalised` against `acceptable_variants` instead | `effective_date` |
| `semantic` | Default rules mode: every entry of `required_elements` (each a list of synonyms) has at least one synonym in `normaliseText(ai_value)`. Optional LLM judge: see §6.6.3 | `confidentiality_obligations`, `permitted_disclosures`, `ip_ownership`, `indemnification`, `service_scope`, `termination_clause`, `dispute_resolution`, `breach_remedy`, `invoice_schedule` |

**Parties:** the label lists each party in `acceptable_variants` groups (`expected_parties: [["Acme Inc", "Acme"], ["Beta LLC", "Beta"]]`). It matches when every group has at least one variant in the AI value.

#### 6.6.3 Optional LLM judge (`--judge llm`) — clearly secondary

- **Only** for `semantic` terms, and only when the rules mode returns no match (it can rescue a match the rules missed, never take one away).
- Model `gpt-4o`, `temperature: 0`, `max_tokens: 5`, `seed: 7`, through the same eval client (so judge calls are recorded and replayed too).
- **Prompt:**
  - System: "You grade contract term extractions. Answer YES or NO only."
  - User: `Term: {term_name}\nReference answer: {expected_value}\nRequired elements: {required_elements joined by '; '}\nCandidate answer: {ai_value}\nDoes the candidate convey every required element without contradicting the reference? Answer YES or NO.`
- The judge never sees confidence scores or source sentences.
- The `Notes` column records `judge=llm:YES` or `judge=llm:NO`. The summary reports the F1 for both rules-only and rules+judge. **CI gates always use the rules-only F1**, which keeps them deterministic.

### 6.7 Label schema — `labels.json` (validated by Zod in `load-dataset.ts`)

```json
{
  "contract_id": "nda-001",
  "contract_type": "nda",
  "jurisdiction": "US-DE",
  "industry": "saas",
  "source": "internal-sme",
  "document": { "pdf": "contract.pdf" },
  "page_count": 4,
  "annotator": "sme-1",
  "annotated_at": "2026-11-02",
  "terms": [
    {
      "term_key": "governing_law",
      "present": true,
      "expected_value": "Delaware",
      "acceptable_variants": ["State of Delaware", "Delaware law"],
      "match_type": "exact_normalised",
      "expected_page": 3,
      "acceptable_pages": [3],
      "notes": ""
    },
    {
      "term_key": "term_duration",
      "present": true,
      "expected_value": "3 years; obligations survive termination",
      "acceptable_variants": ["36 months"],
      "match_type": "duration",
      "survives_termination": true,
      "expected_page": 2,
      "acceptable_pages": [2]
    },
    {
      "term_key": "confidentiality_obligations",
      "present": true,
      "expected_value": "Recipient must keep Confidential Information secret, use it only for the Purpose, and protect it with reasonable care",
      "match_type": "semantic",
      "required_elements": [["secret", "confidential", "not disclose"], ["purpose", "only use", "solely"], ["reasonable care", "same degree of care"]],
      "expected_page": 1,
      "acceptable_pages": [1, 2]
    },
    { "term_key": "non_solicitation", "present": false }
  ]
}
```

Zod rules:
- `contract_type ∈ {nda, msa}`.
- `jurisdiction` matches `^(US|UK|OTHER)(-[A-Z]{2,3})?$`.
- `source ∈ {internal-sme, cuad}`.
- `document` has exactly one of `pdf` or `text`.
- **Every** `TERM_LIBRARY[contract_type]` key appears exactly once in `terms`.
- `present: true` requires `expected_value`, `match_type` and `expected_page` (1..`page_count`). `acceptable_pages` defaults to `[expected_page]`.
- `semantic` requires a non-empty `required_elements`.
- `duration` may set `survives_termination`.
- `present: false` forbids the other fields.

**Custom-term manifest** — `datasets/custom-terms/manifest.json`:

```json
{
  "terms": [
    "Non-compete radius", "Non-compete duration", "Auto-renewal", "Assignment rights", "Force majeure",
    "Data protection obligations", "Insurance requirements", "Audit rights", "Return or destruction of information",
    "Limitation on publicity"
  ],
  "contracts": [
    { "contract_id": "nda-003", "labels": [ { "term_name": "Non-compete radius", "present": false }, … 10 entries ] },
    … 15 contracts total: 8 NDA + 7 MSA, drawn from the main dataset
  ]
}
```

Each custom label uses the same term-label shape as above, keyed by `term_name`. The harness maps it to `customTermKey(term_name)`. `MAX_CUSTOM_TERMS = 5`, so every contract runs **two passes**: terms 1–5, then 6–10. Each pass sends the standard terms plus 5 custom terms, as the app would. Only the custom-term results count towards custom-term F1. Standard-term results from these passes are discarded, so they aren't double-counted.

**Chat set** — `datasets/chat/groundedness.json`:

```json
[
  { "id": "off-01", "contract_id": "nda-001", "category": "off_document",
    "question": "What is the statute of limitations for breach of contract in California?" },
  { "id": "in-01", "contract_id": "msa-004", "category": "in_document",
    "question": "How many days' notice is needed to terminate for convenience?",
    "expected_pages": [7], "expected_answer_contains": [["30 days", "thirty (30) days"]] }
]
```

Exactly 20 `off_document` and 20 `in_document` items, across at least 10 distinct contracts. Off-document questions ask about things that are absent from that contract: general law, other parties, clauses the labels mark `present: false`.

### 6.8 Scripts and CLI

`package.json` scripts:

```json
{
  "eval:extraction":  "NODE_OPTIONS=--conditions=react-server tsx --env-file-if-exists=.env.local evals/run-extraction-eval.ts",
  "eval:calibration": "NODE_OPTIONS=--conditions=react-server tsx --env-file-if-exists=.env.local evals/run-calibration-eval.ts",
  "eval:chat":        "NODE_OPTIONS=--conditions=react-server tsx --env-file-if-exists=.env.local evals/run-chat-groundedness.ts"
}
```

| Flag | Scripts | Values (default) |
|---|---|---|
| `--type` | extraction, calibration | `nda` \| `msa` \| `all` (`all`) |
| `--subset` | all | `smoke` \| `full` (`full`) |
| `--custom` | extraction | also run the custom-term eval |
| `--live` / `--replay` / `--record` | all | mode (from `EVAL_USE_LIVE_OPENAI`) |
| `--judge` | extraction | `rules` \| `llm` (`rules`) |
| `--stage` | extraction, chat | `beta` \| `launch` (`beta`). Picks thresholds |
| `--gate` | all | exit code 1 if any gate fails |
| `--concurrency` | all | parallel contracts (`4`) |
| `--out` | all | report dir (`evals/reports/<ISO timestamp>`) |
| `--expert-template` | chat | also write `expert-review.csv` for the monthly 50-pair audit |

**Exit codes:** `0` pass, `1` gate failure, `2` dataset or config error (invalid labels, a contract over the app limits, missing env in live mode), `3` replay misses beyond the allowance in §6.9.

**`run-extraction-eval.ts` flow:**

```
load datasets (filtered by --type/--subset) → validate
for each contract (concurrency N):
  text = contract.txt ?? extractPdfText(contract.pdf)
  assert limits
  requested = buildRequestedTerms(type, [])
  t0 = now
  { result, usage, attempts } = callExtractionModel({ …, client: evalClient })
  latencyMs = replay ? recording.latency_ms : now - t0
  processed = postProcessTerms({ requested, modelTerms: result.terms, contractText: text, pageCount })
  compare processed vs labels (§6.6) → per-term outcomes
  costUsd = calculateCostUsd(usage.prompt_tokens, usage.completion_tokens)   // includes repair retry usage
if --custom: two passes per manifest contract (§6.7)
compute metrics (§6.9) → write reports (§6.10) → apply gates if --gate
```

**`run-calibration-eval.ts`:** reuses the extraction run. It reads `per-term.json` from the latest full run in `--out` (or runs a fresh one when given `--fresh`) and computes the metrics in §6.9.4.

**`run-chat-groundedness.ts`:** for each question it loads the contract text, runs `classifyQuery`, `buildChatMessages` (empty history), `streamChatCompletion` (eval client) and `parseCitations`, then scores per §6.9.5.

### 6.9 Metrics and gates — `evals/lib/metrics.ts`

#### 6.9.1 Per-term outcome

| Label | AI value (after `postProcessTerms`) | Outcome | TP | FP | FN |
|---|---|---|---|---|---|
| `present: true` | non-null and matches | `TP` | 1 | 0 | 0 |
| `present: true` | non-null and doesn't match | `FP+FN` (wrong value) | 0 | 1 | 1 |
| `present: true` | null | `FN` | 0 | 0 | 1 |
| `present: false` | null | `TN` (not part of F1) | 0 | 0 | 0 |
| `present: false` | non-null | `FP` | 0 | 1 | 0 |

- **Precision** = ΣTP / (ΣTP + ΣFP). **Recall** = ΣTP / (ΣTP + ΣFN). **F1** = 2PR / (P + R), and 0 when P + R = 0.
- **Micro-averaged** over all terms of all contracts, reported separately for NDA and MSA (these are what the gates use), plus breakdowns per `term_key`, per `jurisdiction` and per `source` (report-only, for the PRD fairness audit).
- **Coverage** (US-002, "≥ 80% of standard terms with values") = present-labelled terms with a non-null AI value ÷ present-labelled terms. Report-only.

#### 6.9.2 Page accuracy

Over `TP` outcomes only: the share where `ai_page ∈ acceptable_pages`. Target ≥ 0.92.

#### 6.9.3 Cost and latency

- **Cost per analysis** = Σ `calculateCostUsd` over every model call for that contract, including the repair retry. Report mean, P50, P95 and max. Gate on mean ≤ $0.20 (also print the PRD's all-in budget of $0.25).
- **Latency** = wall-clock duration of `callExtractionModel` plus `postProcessTerms` (in replay mode, the recorded latency). Report P50 and P95. **The latency gate applies in live mode only.**
  - Eval latency covers only the model and post-processing. End-to-end latency (upload → results) is measured in production from `contracts.processing_started_at → processing_completed_at` (`12-rate-limiting-usage.md`).

#### 6.9.4 Calibration

- **Samples:** every post-processed term (standard terms, full set), with confidence `c = confidence_score / 100` (after caps, so this is the value users see).
- **Correctness `y`:** non-null AI value → `y = 1` iff the outcome is `TP`. Null AI value → `y = 1` iff the label is `present: false`.
- **Buckets:** b = 0..9, covering `[b/10, (b+1)/10)`, with the last bucket including 1.0.
- For each bucket: `n_b`, `conf_b = mean(c)`, `acc_b = mean(y)`, `gap_b = |acc_b − conf_b|`.
- **ECE** = Σ_b (n_b / N) · gap_b (report).
- **MCE** = max over buckets with n_b ≥ 5 of gap_b (gate). Buckets with n_b < 5 are reported as "insufficient data" and left out of the gate.
- **Gates:** MCE ≤ 0.10 passes. 0.10 < MCE < 0.15 is a warning. **MCE ≥ 0.15 fails** and the report says: "Set NEXT_PUBLIC_SHOW_CALIBRATION_WARNING=true in Netlify (engineering-doc §8.8)."
- **Output:** `calibration.csv` (`bucket, n, mean_confidence, accuracy, gap`) and an ASCII reliability table in `summary.md`.

#### 6.9.5 Chat groundedness

| Category | Pass condition per item | Gate |
|---|---|---|
| `off_document` | `parseCitations(...).isNotFound === true` | 20/20 (100%) |
| `in_document` | `!isNotFound` **and** `citedPages.length ≥ 1` | ≥ 19/20 (95%) |
| `in_document` (report-only) | `citedPages ∩ expected_pages ≠ ∅`, and every `expected_answer_contains` group has at least one variant in the normalised answer | Reported, not gated |
| All (report-only) | Answer starts with "Based on the document" (case-insensitive) unless `isNotFound` | Reported |

#### 6.9.6 Gates by stage and trigger

| Metric | `beta` | `launch` |
|---|---|---|
| NDA F1 (rules) | ≥ 0.82 | ≥ 0.88 |
| MSA F1 (rules) | ≥ 0.82 | ≥ 0.85 |
| Page accuracy | ≥ 0.92 | ≥ 0.92 |
| Custom-term F1 | ≥ 0.80 | ≥ 0.80 |
| Mean extraction cost | ≤ $0.20 | ≤ $0.20 |
| P95 latency (live only) | ≤ 45 s | ≤ 30 s |
| Chat off-document "cannot find" | 100% | 100% |
| Chat in-document cites a page | ≥ 95% | ≥ 95% |
| Calibration MCE (monthly job) | < 0.15 fail line | ≤ 0.10 pass line |

**Smoke subset** (10 contracts: 5 NDA + 5 MSA, listed in `subsets.json`): the F1 gates are relaxed by 0.05, because a small sample has high variance. The custom-term and calibration gates don't apply.

**Replay misses:** in replay mode, a miss means the prompt changed since the last recording. The contract is skipped and counted. If misses exceed 0, the replay job **passes with a warning** ("recordings stale — live job covers this change"), but only when the live smoke job runs in the same workflow. Otherwise it exits 3.

### 6.10 Reports — `evals/lib/report.ts`

Written to `--out`:

1. **`eval-results.csv`** — the PRD evaluation spreadsheet, exact columns in this order:

   `Contract_ID,Contract_Type,Term_Name,Expected_Value,AI_Extracted_Value,Expected_Page,AI_Page,Confidence_Score,F1_Match,Expert_Rating,Notes`

   | Column | Value |
   |---|---|
   | `Contract_ID` | `contract_id` |
   | `Contract_Type` | `NDA` \| `MSA` |
   | `Term_Name` | display name (custom terms suffixed ` (custom)`) |
   | `Expected_Value` | `expected_value`, or empty when `present: false` |
   | `AI_Extracted_Value` | post-processed value, or empty when null |
   | `Expected_Page` | `expected_page`, or empty |
   | `AI_Page` | post-processed `page_number`, or empty |
   | `Confidence_Score` | integer 0–100 |
   | `F1_Match` | `TP` \| `FP` \| `FN` \| `TN` \| `FP+FN` |
   | `Expert_Rating` | empty (filled in by the SME: `correct` \| `partially` \| `incorrect`) |
   | `Notes` | `match_type=…; source_verified=true\|false; judge=…; prompt=<version>; model=<model>` |

   RFC 4180 quoting, CRLF line endings, UTF-8 with BOM, and the same CSV-injection guard as `16-export.md` (the `toCsv` helper from `src/lib/csv.ts`, specified in `16-export.md`).
2. **`per-term.json`** — every outcome with its raw fields, used by calibration and diffing.
3. **`summary.json`** — `{ run_id, mode, prompt_version, model, stage, git_sha, metrics: {...}, gates: [{ name, value, threshold, passed }], replay_misses, dataset_errors }`.
4. **`summary.md`** — a human-readable table of metrics and gates, the worst 10 terms by F1, per-jurisdiction F1 and the calibration table. CI posts it as a PR comment through `marocchino/sticky-pull-request-comment`.
5. **`calibration.csv`** (calibration script), **`chat-results.csv`** (`id, contract_id, category, question, answer, cited_pages, is_not_found, passed, notes`), and with `--expert-template`, **`expert-review.csv`** (`Pair_ID, Contract_ID, Question, AI_Answer, Cited_Pages, Rating(Grounded|Hallucinated|Not found), Notes`).

### 6.11 CI workflows

**`.github/workflows/ci.yml`** — job `eval`. It runs on pull requests that touch `src/lib/ai/**`, `src/lib/pdf/**` or `evals/**`:

```yaml
eval:
  if: needs.changes.outputs.ai == 'true'
  runs-on: ubuntu-latest
  env: { OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} }
  steps:
    - uses: actions/checkout@v4
      with: { submodules: true, ssh-key: ${{ secrets.EVAL_DATA_DEPLOY_KEY }} }
    - uses: actions/setup-node@v4  (node 20, npm cache)
    - run: npm ci
    - run: npm run eval:extraction -- --replay --subset full --gate          # deterministic, free
    - run: npm run eval:extraction -- --live --subset smoke --stage beta --gate
    - run: npm run eval:chat -- --live --gate
    - uses: actions/upload-artifact@v4 (evals/reports/**, retention-days: 30)
    - posts summary.md as a sticky PR comment
```

| Workflow | Trigger | Runs | Gate |
|---|---|---|---|
| `ci.yml` → `eval` | PR touching AI, PDF or eval paths | replay full + live smoke + live chat | beta thresholds (smoke relaxation) |
| `eval-nightly.yml` | `schedule: '0 2 * * *'` on `main` | `--record --subset full --custom` + chat + calibration | Report only. Opens an issue if beta gates fail. Pushes refreshed recordings to the data repo on a `recordings/<date>` branch |
| `eval-release.yml` | push of tag `v*` | live full + custom + chat with `--stage ${{ vars.EVAL_GATE_STAGE }}` (`beta` until public launch, then `launch`) | Blocks the deploy job (`needs: eval`) |
| `eval-calibration.yml` | `schedule: '0 4 1 * *'` | `eval:calibration -- --live --fresh` | Fails on MCE ≥ 0.15 and opens an issue |

**Cost estimate per PR run:** about $1.50 (10 extractions plus 40 chat calls). Nightly: about $8.

---

## 7. State management

**None.** These are CLI scripts without UI.

---

## 8. Components

**None.**

---

## 9. Design

**None** for the UI. Report files use plain CSV and Markdown. Thresholds and colours in `summary.md` are textual: ✅ / ⚠️ / ❌.

---

## 10. Edge cases

| Condition | Expected behaviour |
|---|---|
| `labels.json` is missing a standard term key | Dataset error, exit 2, naming the contract and the key |
| Dataset contract exceeds 20 pages or 15,000 tokens | Dataset error, exit 2. It must be replaced, because the app would reject it |
| A `contract.pdf` that `extractPdfText` reads as scanned (< 100 words) | Dataset error, exit 2 |
| OpenAI error after the app's retries (live) | Contract marked `errored` and all its present terms count as `FN`. Error rate is reported. Any errors make the gate fail with the reason "N contracts errored" |
| `INVALID_AI_OUTPUT` after the repair retry | Same as above. Counted separately as `invalid_output_count` |
| Replay miss | Handled per §6.9.6 |
| Model returns an extra unrequested `term_key` | Dropped by `postProcessTerms` (same as production). Not counted |
| `postProcessTerms` caps confidence at 49 for an unverified source | The capped value is what's evaluated for calibration (users see it). The value itself is still matched normally |
| Calibration bucket with n < 5 | Reported as "insufficient data", not gated |
| LLM judge disagrees with rules | Rules-only F1 still drives the gates. Both are reported |
| `--judge llm` in replay with no recorded judge responses | Judge misses count as `NO` and are listed in the summary |
| Chat answer cites an out-of-range page | `parseCitations` drops it. The item may fail "cites a page" |
| No `OPENAI_API_KEY` in live or record mode | Config error, exit 2, before any work starts |
| Prompt version env points at a module that doesn't exist | `getExtractionPrompt` throws, giving a config error and exit 2 |

---

## 11. Acceptance criteria

- [ ] `npm run eval:extraction -- --replay` runs with no network and no Supabase, and produces `eval-results.csv` whose header row is exactly `Contract_ID,Contract_Type,Term_Name,Expected_Value,AI_Extracted_Value,Expected_Page,AI_Page,Confidence_Score,F1_Match,Expert_Rating,Notes`.
- [ ] Evals call `callExtractionModel`, `postProcessTerms`, `buildChatMessages`, `streamChatCompletion` and `parseCitations` from `src/lib/ai/**`. There are no copies of prompt or post-processing logic under `evals/`.
- [ ] `summary.json` reports NDA F1, MSA F1, page accuracy, custom-term F1, mean and P95 cost, P50 and P95 latency, ECE, MCE and the chat pass rates, plus every gate with its threshold and result.
- [ ] `--gate --stage beta` fails (exit 1) when NDA F1 is 0.81, and passes when it is 0.82.
- [ ] The custom-term eval runs two passes of 5 terms per contract and never sends more than 5 custom terms in one call.
- [ ] The calibration script uses 10 buckets and gates on MCE over buckets with n ≥ 5. MCE ≥ 0.15 fails and prints the `NEXT_PUBLIC_SHOW_CALIBRATION_WARNING` instruction.
- [ ] The chat eval contains exactly 20 off-document and 20 in-document items, and fails if any off-document answer isn't "cannot find".
- [ ] Recording, then replaying the same run, gives identical metrics.
- [ ] PRs touching `src/lib/ai/**` run the `eval` job and show the summary as a PR comment.
- [ ] Release tags are blocked when the stage gates fail.

---

## 12. Tests

### Unit (`tests/unit/evals/…`, Vitest)

| File | Cases |
|---|---|
| `normalise.test.ts` | NFKC and quote folding. `&` → `and`. Leading article. Trailing punctuation |
| `match.test.ts` | `exact_normalised` with variants. Parties groups. `numeric`: "$1,000,000" = "USD 1 million", "1.5%" = "1.5 percent", "£500k" = "GBP 500,000", "$1,000,000" ≠ "£1,000,000" (currency mismatch). `duration`: "thirty-six (36) months" = "3 years", "90 days" ≠ "3 months"; the survival flag. `date`: UK vs US ordering. `semantic` required elements |
| `metrics.test.ts` | The outcome table (all 5 rows). F1 with zero denominators. Page accuracy only over TP. ECE/MCE on a hand-computed fixture (3 buckets). n < 5 excluded |
| `label-schema.test.ts` | Valid fixture passes. Missing standard key fails. `present: false` with extra fields fails. Page outside range fails |
| `openai-eval-client.test.ts` | Hash stability (key order independent). Replay hit and miss. Record writes the expected file shape |
| `report.test.ts` | Exact CSV header. CRLF. BOM. Injection guard on `=SUM(…)` values |

### Integration (`tests/integration/evals/…`)

| File | Cases |
|---|---|
| `run-extraction-replay.test.ts` | Two synthetic contracts (committed under `tests/fixtures/evals/`, not confidential) plus recordings → run the script in replay mode → assert `summary.json` metrics equal precomputed values and the exit code is 0. Tampering one label gives the expected F1 change |
| `run-chat-replay.test.ts` | Four questions (2 off, 2 in) with recordings → pass rates and exit code. A recording answering an off-document question with content fails the gate (exit 1) |

### E2E

**None.** The harness has no UI.
