// Synthetic eval dataset + recordings for the eval-harness tests (15-evals.md §12). No real contracts.
// Recordings are computed with the harness's own request hash at test time, so a prompt change doesn't
// make these fixtures stale (the prompt snapshot tests catch drift instead).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildChatMessages } from '@/lib/ai/chat';
import { buildExtractionResponseFormat } from '@/lib/ai/extraction-schema';
import { classifyQuery } from '@/lib/ai/classify-query';
import { getExtractionPrompt } from '@/lib/ai/prompts';
import { buildRequestedTerms, TERM_LIBRARY } from '@/lib/ai/term-library';
import { recordingPath, requestHash } from '../../../evals/lib/openai-eval-client';

export const NDA_TEXT = `[PAGE 1]
MUTUAL NON-DISCLOSURE AGREEMENT
This Mutual Non-Disclosure Agreement is entered into on 1 March 2026 by and between Northwind Analytics Ltd and Fabrikam Robotics Inc.
1. Confidentiality. Each Recipient shall keep the Discloser's Confidential Information secret, shall use it solely for the Purpose, and shall protect it with reasonable care.
2. Permitted Disclosures. A Recipient may disclose Confidential Information to its employees and advisers who need to know it, or where required by law.
3. Term. This Agreement continues for three (3) years, and the confidentiality obligations survive termination for two (2) years.
[PAGE 2]
4. Intellectual Property. All Confidential Information remains the property of the Discloser and no licence is granted.
5. Non-Solicitation. For twelve (12) months neither party shall solicit any employee of the other party.
6. Remedies. The Discloser shall be entitled to seek injunctive relief in addition to any other remedy.
7. Governing Law. This Agreement is governed by the laws of England and Wales.
8. Jurisdiction. The courts of England and Wales have exclusive jurisdiction over any dispute.
`;

export const MSA_TEXT = `[PAGE 1]
MASTER SERVICES AGREEMENT
This Master Services Agreement is made between Contoso Cloud LLC and Tailspin Retail Inc.
1. Services. Supplier will provide managed cloud hosting and monitoring for the Customer.
2. Fees. Customer shall pay a monthly fee of $12,000, payable within thirty (30) days of receipt.
3. Invoicing. Supplier will invoice Customer monthly in arrears.
4. Late Payment. Overdue amounts accrue interest at 1.5% per month.
[PAGE 2]
5. Limitation of Liability. Each party's total liability is capped at $500,000.
6. Indemnification. Supplier shall indemnify Customer against third-party claims that the Services infringe any intellectual property right.
7. Intellectual Property. Customer owns its data and Supplier retains its pre-existing tools.
8. Termination. Either party may terminate for convenience on ninety (90) days' notice, or immediately for an uncured material breach.
9. Governing Law. This Agreement is governed by the laws of the State of New York.
10. Disputes. Disputes are resolved by binding arbitration in New York City.
11. Notices. Notices of termination must be given at least ninety (90) days in advance.
`;

type Label = Record<string, unknown> & { term_key: string };
/** Per term: [label, model output]. The NDA has exactly one wrong value (confidentiality) → NDA F1 = 0.9. */
const ND: [Label, { value: string; page: number; source: string }][] = [
  [{ term_key: 'parties', present: true, expected_value: 'Northwind Analytics Ltd and Fabrikam Robotics Inc', expected_parties: [['Northwind'], ['Fabrikam']], match_type: 'exact_normalised', expected_page: 1 },
    { value: 'Northwind Analytics Ltd and Fabrikam Robotics Inc', page: 1, source: 'This Mutual Non-Disclosure Agreement is entered into on 1 March 2026 by and between Northwind Analytics Ltd and Fabrikam Robotics Inc.' }],
  [{ term_key: 'effective_date', present: true, expected_value: '1 March 2026', match_type: 'date', expected_page: 1 },
    { value: '1 March 2026', page: 1, source: 'This Mutual Non-Disclosure Agreement is entered into on 1 March 2026 by and between Northwind Analytics Ltd and Fabrikam Robotics Inc.' }],
  [{ term_key: 'confidentiality_obligations', present: true, expected_value: 'Keep secret, use solely for the Purpose, reasonable care', match_type: 'semantic', required_elements: [['secret'], ['purpose', 'solely'], ['reasonable care']], expected_page: 1 },
    { value: 'Keep it private', page: 1, source: "Each Recipient shall keep the Discloser's Confidential Information secret, shall use it solely for the Purpose, and shall protect it with reasonable care." }],
  [{ term_key: 'permitted_disclosures', present: true, expected_value: 'Employees and advisers; where required by law', match_type: 'semantic', required_elements: [['employee', 'adviser'], ['law']], expected_page: 1 },
    { value: 'To employees and advisers who need to know, or where required by law', page: 1, source: 'A Recipient may disclose Confidential Information to its employees and advisers who need to know it, or where required by law.' }],
  [{ term_key: 'term_duration', present: true, expected_value: '3 years', match_type: 'duration', survives_termination: true, expected_page: 1 },
    { value: '3 years; confidentiality survives termination for 2 years', page: 1, source: 'This Agreement continues for three (3) years, and the confidentiality obligations survive termination for two (2) years.' }],
  [{ term_key: 'ip_ownership', present: true, expected_value: 'Remains the property of the Discloser; no licence', match_type: 'semantic', required_elements: [['property'], ['licence', 'license']], expected_page: 2 },
    { value: 'Remains the property of the Discloser; no licence granted', page: 2, source: 'All Confidential Information remains the property of the Discloser and no licence is granted.' }],
  [{ term_key: 'non_solicitation', present: true, expected_value: '12 months', match_type: 'duration', expected_page: 2 },
    { value: '12 months', page: 2, source: 'For twelve (12) months neither party shall solicit any employee of the other party.' }],
  [{ term_key: 'breach_remedy', present: true, expected_value: 'Injunctive relief', match_type: 'semantic', required_elements: [['injunct']], expected_page: 2 },
    { value: 'Injunctive relief in addition to other remedies', page: 2, source: 'The Discloser shall be entitled to seek injunctive relief in addition to any other remedy.' }],
  [{ term_key: 'governing_law', present: true, expected_value: 'England and Wales', match_type: 'exact_normalised', expected_page: 2 },
    { value: 'England and Wales', page: 2, source: 'This Agreement is governed by the laws of England and Wales.' }],
  [{ term_key: 'jurisdiction', present: true, expected_value: 'England and Wales', match_type: 'exact_normalised', expected_page: 2 },
    { value: 'Courts of England and Wales (exclusive)', page: 2, source: 'The courts of England and Wales have exclusive jurisdiction over any dispute.' }],
];
const MS: [Label, { value: string; page: number; source: string }][] = [
  [{ term_key: 'parties', present: true, expected_value: 'Contoso Cloud LLC and Tailspin Retail Inc', expected_parties: [['Contoso'], ['Tailspin']], match_type: 'exact_normalised', expected_page: 1 }, { value: 'Contoso Cloud LLC and Tailspin Retail Inc', page: 1, source: 'This Master Services Agreement is made between Contoso Cloud LLC and Tailspin Retail Inc.' }],
  [{ term_key: 'service_scope', present: true, expected_value: 'Hosting and monitoring', match_type: 'semantic', required_elements: [['hosting'], ['monitoring']], expected_page: 1 }, { value: 'Managed cloud hosting and monitoring', page: 1, source: 'Supplier will provide managed cloud hosting and monitoring for the Customer.' }],
  [{ term_key: 'payment_terms', present: true, expected_value: '$12,000 per month', match_type: 'numeric', expected_page: 1 }, { value: '$12,000 monthly, due in 30 days', page: 1, source: 'Customer shall pay a monthly fee of $12,000, payable within thirty (30) days of receipt.' }],
  [{ term_key: 'invoice_schedule', present: true, expected_value: 'Monthly in arrears', match_type: 'semantic', required_elements: [['monthly'], ['arrears']], expected_page: 1 }, { value: 'Monthly in arrears', page: 1, source: 'Supplier will invoice Customer monthly in arrears.' }],
  [{ term_key: 'late_payment_penalty', present: true, expected_value: '1.5% per month', match_type: 'numeric', expected_page: 1 }, { value: '1.5% interest per month', page: 1, source: 'Overdue amounts accrue interest at 1.5% per month.' }],
  [{ term_key: 'liability_cap', present: true, expected_value: '$500,000', match_type: 'numeric', expected_page: 2 }, { value: 'USD 500,000', page: 2, source: "Each party's total liability is capped at $500,000." }],
  [{ term_key: 'indemnification', present: true, expected_value: 'Third-party IP infringement', match_type: 'semantic', required_elements: [['third-party', 'third party'], ['infring']], expected_page: 2 }, { value: 'Supplier indemnifies against third-party IP infringement claims', page: 2, source: 'Supplier shall indemnify Customer against third-party claims that the Services infringe any intellectual property right.' }],
  [{ term_key: 'ip_ownership', present: true, expected_value: 'Customer owns its data', match_type: 'semantic', required_elements: [['customer'], ['pre-existing']], expected_page: 2 }, { value: 'Customer owns its data; Supplier keeps pre-existing tools', page: 2, source: 'Customer owns its data and Supplier retains its pre-existing tools.' }],
  [{ term_key: 'termination_clause', present: true, expected_value: 'Convenience on 90 days, or breach', match_type: 'semantic', required_elements: [['convenience'], ['90', 'ninety'], ['breach']], expected_page: 2 }, { value: 'For convenience on 90 days notice, or for uncured material breach', page: 2, source: "Either party may terminate for convenience on ninety (90) days' notice, or immediately for an uncured material breach." }],
  [{ term_key: 'governing_law', present: true, expected_value: 'New York', match_type: 'exact_normalised', expected_page: 2 }, { value: 'State of New York', page: 2, source: 'This Agreement is governed by the laws of the State of New York.' }],
  [{ term_key: 'dispute_resolution', present: true, expected_value: 'Arbitration in New York', match_type: 'semantic', required_elements: [['arbitration'], ['new york']], expected_page: 2 }, { value: 'Binding arbitration in New York City', page: 2, source: 'Disputes are resolved by binding arbitration in New York City.' }],
  [{ term_key: 'notice_period', present: true, expected_value: '90 days', match_type: 'duration', expected_page: 2 }, { value: '90 days', page: 2, source: 'Notices of termination must be given at least ninety (90) days in advance.' }],
];

export const MODEL = 'gpt-4o';
export const USAGE = { prompt_tokens: 6000, completion_tokens: 800 }; // → $0.023 per extraction at $2.50 / $10

/** Writes subsets, 10 contracts (5 NDA + 5 MSA, two distinct texts), a chat set and all recordings into `dir`. */
export function buildEvalFixture(dir: string, opts: { tamper?: { offDocumentAnswer?: boolean } } = {}) {
  const write = (rel: string, data: unknown) => {
    const f = path.join(dir, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
  };
  const recordingsDir = path.join(dir, 'recordings');
  const ids = { nda: [1, 2, 3, 4, 5].map((n) => `nda-fx-00${n}`), msa: [1, 2, 3, 4, 5].map((n) => `msa-fx-00${n}`) };

  for (const type of ['nda', 'msa'] as const) {
    const text = type === 'nda' ? NDA_TEXT : MSA_TEXT;
    const table = type === 'nda' ? ND : MS;
    for (const id of ids[type]) {
      write(`${type}/${id}/contract.txt`, text);
      write(`${type}/${id}/labels.json`, {
        contract_id: id, contract_type: type, jurisdiction: type === 'nda' ? 'UK' : 'US-NY', source: 'cuad',
        document: { text: 'contract.txt' }, page_count: 2, terms: table.map(([l]) => l),
      });
    }
    // One extraction recording per text: the five copies send identical requests.
    const promptVersion = 'extraction-v1.0';
    const requested = buildRequestedTerms(type, []);
    const messages = getExtractionPrompt(promptVersion).buildMessages({ contractType: type, terms: requested, contractText: text });
    const body = { model: MODEL, messages, temperature: 0.1, max_tokens: 2000, response_format: buildExtractionResponseFormat(requested.map((t) => t.key)) };
    const hash = requestHash(body as never);
    const terms = TERM_LIBRARY[type].map((t) => {
      const m = table.find(([l]) => l.term_key === t.key)![1];
      return { term_key: t.key, value: m.value, page_number: m.page, confidence: 0.9, source_sentence: m.source };
    });
    write(path.relative(dir, recordingPath({ promptVersion, model: MODEL, recordingsDir }, MODEL, hash)), {
      request_hash: hash, recorded_at: '2026-10-10T00:00:00Z', latency_ms: 4000,
      response: {
        id: 'c', object: 'chat.completion', created: 0, model: MODEL,
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', refusal: null, content: JSON.stringify({ detected_contract_type: type, terms }) } }],
        usage: { ...USAGE, total_tokens: USAGE.prompt_tokens + USAGE.completion_tokens },
      },
    });
  }
  write('subsets.json', { smoke: ['nda-fx-001', 'msa-fx-001'], full: 'all' });

  // Chat: 2 off + 2 in per contract = 40. Every off answer is "cannot find"; every in answer cites a page.
  const items: Record<string, unknown>[] = [];
  let first = true;
  for (const type of ['nda', 'msa'] as const) {
    for (const [i, id] of ids[type].entries()) {
      const qs = [
        { id: `off-${type}-${i}-1`, category: 'off_document', q: `What is the statute of limitations in California? (${id})`, a: 'I cannot find this in the document.' },
        { id: `off-${type}-${i}-2`, category: 'off_document', q: `Who is the chief executive of the other party? (${id})`, a: 'I cannot find this in the document.' },
        { id: `in-${type}-${i}-1`, category: 'in_document', q: `Which law governs this agreement? (${id})`, a: 'Based on the document, it is governed by the stated law [Page 2].', pages: [2] },
        { id: `in-${type}-${i}-2`, category: 'in_document', q: `Who are the parties? (${id})`, a: 'Based on the document, the parties are named on the first page [Page 1].', pages: [1] },
      ];
      for (const it of qs) {
        let answer = it.a;
        if (opts.tamper?.offDocumentAnswer && it.category === 'off_document' && first) {
          answer = 'Based on the document, it is two years [Page 1].';
          first = false;
        }
        items.push({ id: it.id, contract_id: id, category: it.category, question: it.q, ...('pages' in it ? { expected_pages: it.pages } : {}) });
        const messages = buildChatMessages({ version: 'chat-v1.0', contractType: type, contractText: type === 'nda' ? NDA_TEXT : MSA_TEXT, queryType: classifyQuery(it.q), history: [], question: it.q, maxInputTokens: 100_000 });
        const hash = requestHash({ model: MODEL, messages, temperature: 0.4, max_tokens: 1000 } as never);
        write(path.relative(dir, recordingPath({ promptVersion: 'chat-v1.0', model: MODEL, recordingsDir }, MODEL, hash)), {
          request_hash: hash, recorded_at: '2026-10-10T00:00:00Z', latency_ms: 1500,
          response: { stream: true, text: answer, usage: { prompt_tokens: 1500, completion_tokens: 30 } },
        });
      }
    }
  }
  write('chat/groundedness.json', items);
}
