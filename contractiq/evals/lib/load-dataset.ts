// Dataset loading + validation (15-evals.md §6.7). Every problem is collected and reported together
// as a ConfigError (exit 2), naming the contract and the field.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { countTokens } from '@/lib/ai/token-count';
import { TERM_LIBRARY } from '@/lib/ai/term-library';
import { MAX_CONTRACT_TOKENS, MAX_CUSTOM_TERMS, MAX_PAGES, MIN_WORDS } from '@/lib/constants';
import { countWords, extractPdfText } from '@/lib/pdf/extract-text';
import { PAGE_MARKER_REGEX } from '@/lib/pdf/page-markers';
import type { ContractType } from '@/types/domain';
import { ConfigError } from './cli';

const MatchType = z.enum(['exact_normalised', 'numeric', 'duration', 'date', 'semantic']);
export type MatchType = z.infer<typeof MatchType>;

const presentShape = {
  present: z.literal(true),
  expected_value: z.string().min(1),
  acceptable_variants: z.array(z.string().min(1)).optional(),
  /** Parties: one group of acceptable spellings per party; every group must match. */
  expected_parties: z.array(z.array(z.string().min(1)).min(1)).optional(),
  match_type: MatchType,
  required_elements: z.array(z.array(z.string().min(1)).min(1)).optional(),
  survives_termination: z.boolean().optional(),
  expected_page: z.number().int().min(1),
  acceptable_pages: z.array(z.number().int().min(1)).optional(),
  notes: z.string().optional(),
};

/** A term label keyed by `term_key` (standard) or `term_name` (custom). `present: false` forbids every other field. */
function termLabel<K extends 'term_key' | 'term_name'>(key: K) {
  const keyShape = { [key]: z.string().min(1) } as Record<K, z.ZodString>;
  const present = z
    .object({ ...presentShape, ...keyShape })
    .strict()
    .superRefine((t, ctx) => {
      if (t.match_type === 'semantic' && !t.required_elements?.length) {
        ctx.addIssue({ code: 'custom', message: 'semantic terms need a non-empty required_elements' });
      }
      if (t.survives_termination !== undefined && t.match_type !== 'duration') {
        ctx.addIssue({ code: 'custom', message: 'survives_termination is only allowed on duration terms' });
      }
    });
  const absent = z.object({ present: z.literal(false), ...keyShape }).strict();
  return z.union([present, absent]);
}
const StandardTermLabel = termLabel('term_key');
const CustomTermLabel = termLabel('term_name');

const ContractLabels = z
  .object({
    contract_id: z.string().regex(/^[a-z0-9-]+$/),
    contract_type: z.enum(['nda', 'msa']),
    jurisdiction: z.string().regex(/^(US|UK|OTHER)(-[A-Z]{2,3})?$/),
    industry: z.string().optional(),
    source: z.enum(['internal-sme', 'cuad']),
    document: z.union([z.object({ pdf: z.string() }).strict(), z.object({ text: z.string() }).strict()]),
    page_count: z.number().int().min(1).max(MAX_PAGES),
    annotator: z.string().optional(),
    annotated_at: z.string().optional(),
    terms: z.array(StandardTermLabel),
  })
  .strict();

type PresentFields = z.infer<z.ZodObject<typeof presentShape>>;
/** A term label after defaults: acceptable_pages always set when present. */
export type TermLabel = ({ present: true } & Omit<PresentFields, 'acceptable_pages'> & { acceptable_pages: number[] }) | { present: false };
export type StandardLabel = TermLabel & { term_key: string };
export type CustomLabel = TermLabel & { term_name: string };

export type EvalContract = {
  contract_id: string;
  contract_type: ContractType;
  jurisdiction: string;
  source: 'internal-sme' | 'cuad';
  page_count: number;
  text: string;
  labels: StandardLabel[];
};

const Subsets = z.object({ smoke: z.array(z.string()).min(1), full: z.literal('all') }).strict();

const CustomManifest = z
  .object({
    terms: z.array(z.string().min(2).max(60)).length(10),
    contracts: z.array(z.object({ contract_id: z.string(), labels: z.array(CustomTermLabel) }).strict()).min(1),
  })
  .strict();
export type CustomContract = { contract: EvalContract; terms: string[]; labels: CustomLabel[] };

const ChatItem = z.discriminatedUnion('category', [
  z.object({ id: z.string(), contract_id: z.string(), category: z.literal('off_document'), question: z.string().min(1) }).strict(),
  z
    .object({
      id: z.string(),
      contract_id: z.string(),
      category: z.literal('in_document'),
      question: z.string().min(1),
      expected_pages: z.array(z.number().int().min(1)).min(1),
      expected_answer_contains: z.array(z.array(z.string().min(1)).min(1)).optional(),
    })
    .strict(),
]);
export type ChatItem = z.infer<typeof ChatItem>;

const fmt = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

function readJson(file: string, problems: string[]): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    problems.push(`${file}: ${(e as Error).message}`);
    return undefined;
  }
}

function withPageDefaults<T extends { present: boolean }>(t: T): T & TermLabel {
  if (!t.present) return t as T & TermLabel;
  const p = t as unknown as PresentFields;
  return { ...t, acceptable_pages: p.acceptable_pages ?? [p.expected_page] } as T & TermLabel;
}

function checkPages(where: string, t: TermLabel, pageCount: number, problems: string[]) {
  if (!t.present) return;
  for (const p of [t.expected_page, ...t.acceptable_pages]) {
    if (p > pageCount) problems.push(`${where}: page ${p} is outside 1..${pageCount}`);
  }
}

/** Contract text with [PAGE N] markers, from contract.txt or via the app's extractPdfText. */
async function loadText(dir: string, doc: { pdf: string } | { text: string }): Promise<{ text: string; pageCount: number }> {
  if ('text' in doc) {
    const text = readFileSync(path.join(dir, doc.text), 'utf8');
    const pages = new Set([...text.matchAll(new RegExp(PAGE_MARKER_REGEX.source, 'g'))].map((m) => m[1]));
    return { text, pageCount: pages.size };
  }
  const r = await extractPdfText(readFileSync(path.join(dir, doc.pdf)));
  return { text: r.text, pageCount: r.pageCount };
}

/** Loads and validates one contract directory. Problems are appended; returns null if unusable. */
async function loadContract(dir: string, problems: string[]): Promise<EvalContract | null> {
  const id = path.basename(dir);
  const raw = readJson(path.join(dir, 'labels.json'), problems);
  if (raw === undefined) return null;
  const parsed = ContractLabels.safeParse(raw);
  if (!parsed.success) {
    problems.push(`${id}/labels.json: ${fmt(parsed.error)}`);
    return null;
  }
  const l = parsed.data;
  const before = problems.length;
  if (l.contract_id !== id) problems.push(`${id}: contract_id "${l.contract_id}" does not match its folder name`);

  // Every standard key exactly once; nothing else.
  const expected = TERM_LIBRARY[l.contract_type].map((t) => t.key);
  const counts = new Map<string, number>();
  for (const t of l.terms) counts.set(t.term_key, (counts.get(t.term_key) ?? 0) + 1);
  for (const k of expected) if (!counts.has(k)) problems.push(`${id}: missing standard term key "${k}"`);
  for (const [k, n] of counts) {
    if (!expected.includes(k)) problems.push(`${id}: unknown term key "${k}" for ${l.contract_type}`);
    else if (n > 1) problems.push(`${id}: term key "${k}" appears ${n} times`);
  }
  const labels = l.terms.map((t) => withPageDefaults(t) as StandardLabel);
  for (const t of labels) checkPages(`${id}/${t.term_key}`, t, l.page_count, problems);

  // App limits (03, README §3.5): a contract the app would reject is a dataset error.
  try {
    const { text, pageCount } = await loadText(dir, l.document);
    const words = countWords(text);
    const tokens = countTokens(text);
    if (pageCount !== l.page_count) problems.push(`${id}: labels say ${l.page_count} pages, document has ${pageCount}`);
    if (pageCount > MAX_PAGES) problems.push(`${id}: ${pageCount} pages (max ${MAX_PAGES})`);
    if (words < MIN_WORDS) problems.push(`${id}: ${words} words — reads as scanned (min ${MIN_WORDS})`);
    if (tokens > MAX_CONTRACT_TOKENS) problems.push(`${id}: ${tokens} tokens (max ${MAX_CONTRACT_TOKENS})`);
    if (problems.length > before) return null;
    return { contract_id: l.contract_id, contract_type: l.contract_type, jurisdiction: l.jurisdiction, source: l.source, page_count: pageCount, text, labels };
  } catch (e) {
    problems.push(`${id}: could not read document — ${(e as Error).message}`);
    return null;
  }
}

export type LoadOptions = { dataDir: string; type: 'nda' | 'msa' | 'all'; subset: 'smoke' | 'full' };

function assertDataDir(dataDir: string) {
  if (!existsSync(path.join(dataDir, 'subsets.json'))) {
    throw new ConfigError(`No dataset at ${dataDir}`, [
      'Expected subsets.json, nda/, msa/, custom-terms/ and chat/ (see evals/README.md).',
      'The real dataset is the contractiq-eval-data submodule; use --data <dir> for another location.',
    ]);
  }
}

/** Every contract (both types) by id — the custom-term and chat sets reference contracts by id. */
async function loadAll(dataDir: string, problems: string[]): Promise<Map<string, EvalContract>> {
  const byId = new Map<string, EvalContract>();
  for (const type of ['nda', 'msa'] as const) {
    const typeDir = path.join(dataDir, type);
    if (!existsSync(typeDir)) continue;
    for (const entry of readdirSync(typeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const c = await loadContract(path.join(typeDir, entry.name), problems);
      if (c && c.contract_type !== type) problems.push(`${c.contract_id}: contract_type ${c.contract_type} but stored under ${type}/`);
      else if (c) byId.set(c.contract_id, c);
    }
  }
  return byId;
}

function subsetIds(dataDir: string, subset: 'smoke' | 'full', all: Map<string, EvalContract>, problems: string[]): Set<string> {
  const raw = readJson(path.join(dataDir, 'subsets.json'), problems);
  const parsed = Subsets.safeParse(raw);
  if (!parsed.success) {
    problems.push(`subsets.json: ${fmt(parsed.error)}`);
    return new Set();
  }
  if (subset === 'full') return new Set(all.keys());
  for (const id of parsed.data.smoke) if (!all.has(id)) problems.push(`subsets.json: smoke id "${id}" is not a valid contract`);
  return new Set(parsed.data.smoke);
}

function fail(problems: string[]): never {
  throw new ConfigError(`Dataset error (${problems.length} problem${problems.length === 1 ? '' : 's'})`, problems);
}

export async function loadExtractionDataset(o: LoadOptions): Promise<EvalContract[]> {
  assertDataDir(o.dataDir);
  const problems: string[] = [];
  const all = await loadAll(o.dataDir, problems);
  const ids = subsetIds(o.dataDir, o.subset, all, problems);
  if (problems.length) fail(problems);
  const picked = [...all.values()].filter((c) => ids.has(c.contract_id) && (o.type === 'all' || c.contract_type === o.type));
  if (!picked.length) fail([`No contracts match --type ${o.type} --subset ${o.subset}`]);
  return picked.sort((a, b) => a.contract_id.localeCompare(b.contract_id));
}

export async function loadCustomTermDataset(o: LoadOptions): Promise<CustomContract[]> {
  const problems: string[] = [];
  const all = await loadAll(o.dataDir, problems);
  const raw = readJson(path.join(o.dataDir, 'custom-terms', 'manifest.json'), problems);
  const parsed = CustomManifest.safeParse(raw);
  if (!parsed.success) problems.push(`custom-terms/manifest.json: ${fmt(parsed.error)}`);
  if (problems.length || !parsed.success) fail(problems);
  const { terms, contracts } = parsed.data;
  if (terms.length % MAX_CUSTOM_TERMS !== 0) problems.push(`custom-terms: ${terms.length} terms is not a multiple of ${MAX_CUSTOM_TERMS}`);
  const out: CustomContract[] = [];
  for (const entry of contracts) {
    const contract = all.get(entry.contract_id);
    if (!contract) {
      problems.push(`custom-terms: unknown contract "${entry.contract_id}"`);
      continue;
    }
    const names = entry.labels.map((l) => l.term_name);
    for (const t of terms) if (names.filter((n) => n === t).length !== 1) problems.push(`custom-terms/${entry.contract_id}: needs exactly one label for "${t}"`);
    for (const n of names) if (!terms.includes(n)) problems.push(`custom-terms/${entry.contract_id}: "${n}" is not in the manifest terms`);
    const labels = entry.labels.map((l) => withPageDefaults(l) as CustomLabel);
    for (const l of labels) checkPages(`custom-terms/${entry.contract_id}/${l.term_name}`, l, contract.page_count, problems);
    if (o.type === 'all' || contract.contract_type === o.type) out.push({ contract, terms, labels });
  }
  if (problems.length) fail(problems);
  return out;
}

export async function loadChatDataset(o: Omit<LoadOptions, 'type'>): Promise<{ items: ChatItem[]; contracts: Map<string, EvalContract> }> {
  assertDataDir(o.dataDir);
  const problems: string[] = [];
  const all = await loadAll(o.dataDir, problems);
  const ids = subsetIds(o.dataDir, o.subset, all, problems);
  const raw = readJson(path.join(o.dataDir, 'chat', 'groundedness.json'), problems);
  const parsed = z.array(ChatItem).safeParse(raw);
  if (!parsed.success) problems.push(`chat/groundedness.json: ${fmt(parsed.error)}`);
  if (problems.length || !parsed.success) fail(problems);
  const items = parsed.data;
  const off = items.filter((i) => i.category === 'off_document').length;
  const inDoc = items.length - off;
  if (off !== 20 || inDoc !== 20) problems.push(`chat: needs exactly 20 off_document and 20 in_document items (has ${off} + ${inDoc})`);
  if (new Set(items.map((i) => i.contract_id)).size < 10) problems.push('chat: items must span at least 10 distinct contracts');
  if (new Set(items.map((i) => i.id)).size !== items.length) problems.push('chat: duplicate item ids');
  for (const i of items) {
    const c = all.get(i.contract_id);
    if (!c) problems.push(`chat/${i.id}: unknown contract "${i.contract_id}"`);
    else if (i.category === 'in_document') {
      for (const p of i.expected_pages) if (p > c.page_count) problems.push(`chat/${i.id}: expected page ${p} is outside 1..${c.page_count}`);
    }
  }
  if (problems.length) fail(problems);
  return { items: items.filter((i) => ids.has(i.contract_id)), contracts: all };
}
