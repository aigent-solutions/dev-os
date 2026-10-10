import { slugify } from '@/lib/utils';
import type { ContractType } from '@/types/domain';

// Contract-type term library (04-term-preview-custom-terms.md §6). Imported by client components
// (the preview), so it must not import anything server-side.
export type TermDefinition = { key: string; name: string; description: string | null; extractionHint: string };
export type RequestedTerm = TermDefinition & { isCustom: boolean; customKeyTermId: string | null; displayOrder: number };

export const TERM_LIBRARY_VERSION = 'terms-v1.0'; // bump whenever keys, names or hints change

export const TERM_LIBRARY: Record<ContractType, TermDefinition[]> = {
  nda: [
    {
      key: 'parties',
      name: 'Parties',
      description: 'The people or companies signing the agreement, and which one is sharing confidential information.',
      extractionHint:
        "Full legal names of every party, and each party's role (Disclosing Party, Receiving Party, or mutual). Include registered addresses or company numbers only if stated next to the names.",
    },
    {
      key: 'effective_date',
      name: 'Effective Date',
      description: 'The date the agreement starts to apply.',
      extractionHint:
        'The exact date the agreement takes effect (e.g. "1 March 2026"), or the triggering event if no fixed date is given (e.g. "date of last signature").',
    },
    {
      key: 'confidentiality_obligations',
      name: 'Confidentiality Obligations',
      description: 'What the receiving party must do to keep information secret.',
      extractionHint:
        'Core duties of the receiving party: non-use beyond the stated purpose, non-disclosure, the required standard of care (e.g. "reasonable care"), and any limit on who inside the company may see the information. Summarise in one or two sentences.',
    },
    {
      key: 'permitted_disclosures',
      name: 'Permitted Disclosures',
      description: 'Situations where sharing the information is allowed.',
      extractionHint:
        'Exceptions where disclosure is allowed: employees or advisers on a need-to-know basis, disclosures required by law, court or regulator (and any notice requirement), and information that is public, already known or independently developed.',
    },
    {
      key: 'term_duration',
      name: 'Term & Duration',
      description: 'How long the agreement lasts and how long secrecy must be kept.',
      extractionHint:
        'The length of the agreement AND how long the confidentiality obligations survive after it ends (e.g. "2 years; obligations survive 5 years after termination"). Give exact numbers and units.',
    },
    {
      key: 'governing_law',
      name: 'Governing Law',
      description: "Which country's or state's law applies to the agreement.",
      extractionHint:
        'The jurisdiction whose law governs the agreement (e.g. "Laws of England and Wales", "State of Delaware").',
    },
    {
      key: 'jurisdiction',
      name: 'Jurisdiction',
      description: 'Where any court case about the agreement would be heard.',
      extractionHint:
        'The courts that have jurisdiction over disputes, and whether that is exclusive or non-exclusive (e.g. "Exclusive jurisdiction of the courts of New York County").',
    },
    {
      key: 'ip_ownership',
      name: 'IP Ownership',
      description: 'Who owns the ideas, data and intellectual property that are shared.',
      extractionHint:
        'Who owns the confidential information and any intellectual property in it; whether any licence is granted (usually "no licence granted"); and ownership of feedback or derivatives if stated.',
    },
    {
      key: 'non_solicitation',
      name: 'Non-Solicitation',
      description: "Whether either side is banned from hiring or poaching the other's staff or clients.",
      extractionHint:
        "Any restriction on soliciting or hiring the other party's employees, contractors or customers, with its duration and scope. Return null if there is no such clause.",
    },
    {
      key: 'breach_remedy',
      name: 'Breach & Remedy',
      description: 'What happens if someone breaks the agreement.',
      extractionHint:
        'Consequences of breach: injunctive or equitable relief, indemnities, damages, liquidated damages, and obligations to return or destroy information.',
    },
  ],
  msa: [
    {
      key: 'parties',
      name: 'Parties',
      description: 'The companies or people entering the agreement, and who is the customer and who is the provider.',
      extractionHint: "Full legal names of every party, and each party's role (Customer/Client, Supplier/Provider/Contractor).",
    },
    {
      key: 'service_scope',
      name: 'Service Scope',
      description: 'What services are being provided.',
      extractionHint:
        'The services or deliverables the provider must supply, and whether detailed scope is set in separate Statements of Work or Order Forms. Summarise in one or two sentences.',
    },
    {
      key: 'payment_terms',
      name: 'Payment Terms',
      description: 'How much is paid and how quickly invoices must be paid.',
      extractionHint:
        'Fees or the pricing basis (fixed, time-and-materials, per SOW), currency, and the payment deadline after invoice (e.g. "Net 30").',
    },
    {
      key: 'invoice_schedule',
      name: 'Invoice Schedule',
      description: 'When the provider sends invoices.',
      extractionHint:
        'How often and when invoices are issued (e.g. "monthly in arrears", "on milestone completion", "annually in advance").',
    },
    {
      key: 'late_payment_penalty',
      name: 'Late Payment Penalty',
      description: 'Extra charges or consequences if you pay late.',
      extractionHint:
        'Interest rate or fee on overdue amounts (e.g. "1.5% per month") and any right to suspend services for non-payment, with notice periods.',
    },
    {
      key: 'liability_cap',
      name: 'Liability Cap',
      description: 'The maximum amount either side can be made to pay if things go wrong.',
      extractionHint:
        'The cap on each party\'s total liability (e.g. "fees paid in the 12 months preceding the claim"), any excluded loss types (indirect, consequential, lost profits), and carve-outs from the cap.',
    },
    {
      key: 'indemnification',
      name: 'Indemnification',
      description: "Who must cover the other's costs if certain claims arise (for example IP infringement).",
      extractionHint:
        'Which party indemnifies the other, for which claims (e.g. third-party IP infringement, data breach, negligence), and the procedure or conditions if stated.',
    },
    {
      key: 'ip_ownership',
      name: 'IP Ownership',
      description: 'Who owns the work product and existing intellectual property.',
      extractionHint:
        'Ownership of deliverables and work product (assigned to customer or retained by provider), treatment of pre-existing or background IP, and any licence granted.',
    },
    {
      key: 'termination_clause',
      name: 'Termination Clause',
      description: 'How and when either side can end the agreement.',
      extractionHint:
        'Termination for convenience (who, notice period), termination for cause or material breach (cure period), insolvency triggers, and effects of termination. Include any auto-renewal and the opt-out deadline.',
    },
    {
      key: 'governing_law',
      name: 'Governing Law',
      description: "Which country's or state's law applies to the agreement.",
      extractionHint: 'The jurisdiction whose law governs the agreement.',
    },
    {
      key: 'dispute_resolution',
      name: 'Dispute Resolution',
      description: 'How disagreements are resolved (courts, arbitration or mediation).',
      extractionHint:
        'The dispute process: negotiation or escalation steps, mediation, arbitration (body, seat, rules), or courts, including any exclusive venue.',
    },
    {
      key: 'notice_period',
      name: 'Notice Period',
      description: 'How much warning must be given, and how formal notices must be sent.',
      extractionHint:
        'The notice period required for termination or non-renewal, and how formal notices must be delivered (email, post, addresses). If several notice periods exist, give the termination notice period first.',
    },
  ],
};

export function customTermKey(name: string): string {
  const slug = slugify(name);
  return `custom_${slug || 'term'}`;
}

/** Standard terms first (display order 1..n), then custom terms in the order the user entered them. */
export function buildRequestedTerms(type: ContractType, custom: { id: string; term_name: string }[]): RequestedTerm[] {
  const standard: RequestedTerm[] = TERM_LIBRARY[type].map((t, i) => ({
    ...t,
    isCustom: false,
    customKeyTermId: null,
    displayOrder: i + 1,
  }));
  const usedKeys = new Set(standard.map((t) => t.key));
  const customTerms: RequestedTerm[] = custom.map((c, i) => {
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
