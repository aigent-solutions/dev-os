# ContractIQ AI evals

Offline harness that measures the AI against the PRD quality targets (spec: `docs/specs/15-evals.md`).
The scripts call the **same library functions the app uses** (`callExtractionModel`, `postProcessTerms`,
`buildChatMessages`, `streamChatCompletion`, `parseCitations`, …) with an injected OpenAI client.
They never touch Supabase and never import `src/server/services/*`.

| Script | What it measures | Gates (beta / launch) |
|---|---|---|
| `npm run eval:extraction` | Key-term F1 (NDA, MSA), page accuracy, cost, latency; `--custom` adds custom-term F1 | NDA F1 ≥ 0.82 / 0.88 · MSA F1 ≥ 0.82 / 0.85 · page accuracy ≥ 0.92 · custom F1 ≥ 0.80 · mean cost ≤ $0.20 · P95 latency ≤ 45 s / 30 s (live only) · 0 errored contracts |
| `npm run eval:calibration` | Confidence calibration, 10 buckets: ECE (report), MCE over buckets with n ≥ 5 | MCE < 0.15 fails the gate; 0.10–0.15 is a warning |
| `npm run eval:chat` | Chat groundedness: 20 off-document + 20 in-document questions | 100% "cannot find" off-document · ≥ 95% of in-document answers cite a page |

The smoke subset (10 contracts) relaxes the F1 gates by 0.05; custom-term and calibration gates don't apply to it.

## Running

```bash
npm run eval:extraction -- --subset smoke --live          # quick feedback on a prompt change (≈ $0.30)
npm run eval:extraction -- --replay --gate                # full set from recordings: free, no network
npm run eval:extraction -- --record --custom              # live, and refresh recordings
npm run eval:calibration -- --fresh --live --gate         # monthly calibration check
npm run eval:chat -- --live --gate --expert-template      # chat + the monthly expert-review CSV
```

| Flag | Scripts | Values (default) |
|---|---|---|
| `--type` | extraction, calibration | `nda` \| `msa` \| `all` (`all`) |
| `--subset` | all | `smoke` \| `full` (`full`) |
| `--custom` | extraction | also run the custom-term eval (two passes of 5 terms per contract) |
| `--live` / `--replay` / `--record` | all | mode; default from `EVAL_USE_LIVE_OPENAI` (`true` → live, else replay) |
| `--judge` | extraction | `rules` \| `llm` (`rules`). The LLM judge only rescues semantic misses; gates always use rules-only F1 |
| `--stage` | extraction, chat | `beta` \| `launch` (`beta`) |
| `--gate` | all | exit 1 if any gate fails |
| `--concurrency` | all | parallel contracts (`4`) |
| `--out` | all | report directory (`evals/reports/<ISO timestamp>`) |
| `--data` | all | dataset directory (`evals/datasets`) |
| `--allow-replay-misses` | extraction, chat | replay misses warn instead of exit 3. Use only when a live job runs in the same workflow |
| `--fresh` / `--from <dir>` | calibration | run a new full extraction, or read `per-term.json` from a given run (default: the latest full run in `evals/reports/`) |
| `--expert-template` | chat | also write `expert-review.csv` |

**Exit codes:** `0` pass · `1` gate failed · `2` dataset or config error · `3` replay misses (stale recordings).

**Environment.** `evals/lib/env-setup.ts` loads `.env.local` with `@next/env` (the app's own loader) and fills
placeholders for the Supabase and other app variables evals never use. You need:

- `OPENAI_PRICE_INPUT_PER_MTOK` and `OPENAI_PRICE_OUTPUT_PER_MTOK`, always (they drive the cost metric and gate).
- `OPENAI_API_KEY` in live and record mode only.
- Optional, with the app's defaults: `OPENAI_EXTRACTION_MODEL`, `OPENAI_CHAT_MODEL`, `EXTRACTION_PROMPT_VERSION`, `CHAT_PROMPT_VERSION`, `CHAT_MAX_INPUT_TOKENS`.

## Reports

Each run writes to `--out` (git-ignored; CI uploads them as artifacts for 30 days):

- `eval-results.csv`: the PRD evaluation spreadsheet (`Contract_ID,…,F1_Match,Expert_Rating,Notes`). The SME fills in `Expert_Rating` (`correct` \| `partially` \| `incorrect`).
- `per-term.json`: every outcome with its raw fields. The calibration script reads this.
- `summary.json` / `summary.md`: metrics, gates, the worst 10 terms, F1 per jurisdiction and source, and the calibration table.
- `calibration.csv`, `chat-results.csv`, `expert-review.csv`.

## Dataset

Real contracts and SME labels are confidential. They live in the private repository **`contractiq-eval-data`**,
checked out at `evals/datasets/`, which is git-ignored here. Model responses quote contract text word for word, so
recordings live in the same repository.

> **Status:** `contractiq-eval-data` does not exist yet. To set it up: create the private repo with the layout
> below, add a read-only deploy key as the `EVAL_DATA_DEPLOY_KEY` Actions secret, and add a key with write access
> as `EVAL_DATA_WRITE_KEY` (the nightly job pushes refreshed recordings). Until then the CI eval jobs skip with a
> warning. If you later make it a git submodule, remove the `/evals/datasets/*` lines from `.gitignore`.

```
datasets/
├── nda/<contract_id>/{contract.pdf | contract.txt, labels.json}
├── msa/<contract_id>/…
├── custom-terms/manifest.json     # 10 custom terms × 15 contracts (8 NDA + 7 MSA)
├── chat/groundedness.json         # exactly 20 off_document + 20 in_document, ≥ 10 contracts
├── subsets.json                   # { "smoke": [10 ids: 5 NDA + 5 MSA], "full": "all" }
└── recordings/<prompt_version>/<model>/<request_hash>.json
```

### Adding a labelled contract

1. Create `nda/<id>/` or `msa/<id>/` (the id is lowercase, digits and dashes, and matches the folder name).
2. Add `contract.pdf`, or `contract.txt` that already contains `[PAGE N]` markers. The app's limits apply: ≤ 20 pages,
   ≥ 100 words, ≤ 15,000 tokens. A contract the app would reject is a dataset error (exit 2).
3. Write `labels.json`. **Every** standard term key for the type appears exactly once:

```json
{
  "contract_id": "nda-001", "contract_type": "nda", "jurisdiction": "US-DE", "industry": "saas",
  "source": "internal-sme", "document": { "pdf": "contract.pdf" }, "page_count": 4,
  "annotator": "sme-1", "annotated_at": "2026-11-02",
  "terms": [
    { "term_key": "governing_law", "present": true, "expected_value": "Delaware",
      "acceptable_variants": ["State of Delaware"], "match_type": "exact_normalised", "expected_page": 3 },
    { "term_key": "non_solicitation", "present": false }
  ]
}
```

| `match_type` | Matches when… |
|---|---|
| `exact_normalised` | the expected value or a variant is a substring of the AI value (after NFKC, case, quote, dash and article folding). For parties, use `expected_parties: [["Acme Inc", "Acme"], ["Beta LLC"]]`: every group must match |
| `numeric` | the currency amounts / percentages are equal as a multiset (`$1,000,000` = `USD 1 million`, `1.5%` = `1.5 percent`) |
| `duration` | equal durations. Days and weeks compare in days; months and years compare in months (`36 months` = `3 years`, `90 days` ≠ `3 months`). `survives_termination: true` also requires the AI value to mention survival |
| `date` | equal calendar dates (UK day-first order when `jurisdiction` starts with `UK`). A relative date falls back to `exact_normalised` |
| `semantic` | every `required_elements` group has at least one synonym in the AI value |

`present: false` forbids every other field. `acceptable_pages` defaults to `[expected_page]`.
