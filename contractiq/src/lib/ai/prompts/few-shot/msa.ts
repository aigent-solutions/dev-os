import type { FewShotExample } from '../types';

// MSA few-shot examples (05 §6.7). Example 1 is verbatim from the spec. Examples 2 and 3 are synthetic
// (fictional parties): ex 2 is UK drafting with a not-found term and an ambiguous dispute clause; ex 3 is
// US drafting with an ambiguous termination clause. Every source_sentence appears verbatim in its excerpt.
export const MSA_FEW_SHOT: FewShotExample[] = [
  {
    id: 'msa-1-us-design',
    contractType: 'msa',
    excerpt: `[PAGE 1]
MASTER SERVICES AGREEMENT
This Master Services Agreement ("Agreement") is made between Northwind Retail LLC, a Texas limited liability company ("Client"), and Pixelforge Studio Ltd, a company registered in England and Wales ("Provider").
1. Services. Provider shall perform the design and development services described in each Statement of Work ("SOW") executed by the parties.
2. Fees and Payment. Client shall pay the fees set out in each SOW. Provider shall invoice Client monthly in arrears, and Client shall pay each undisputed invoice within thirty (30) days of receipt. Overdue amounts shall accrue interest at 1.5% per month.
[PAGE 2]
3. Intellectual Property. Upon full payment, Provider assigns to Client all rights in the deliverables created under an SOW. Provider retains ownership of its pre-existing tools and know-how and grants Client a non-exclusive licence to use them as part of the deliverables.
4. Indemnity. Provider shall indemnify Client against any third-party claim that the deliverables infringe that third party's intellectual property rights.
5. Limitation of Liability. Except for the indemnity in Clause 4, each party's total liability under this Agreement shall not exceed the fees paid by Client in the twelve (12) months preceding the claim. Neither party is liable for indirect or consequential loss or loss of profits.
6. Term and Termination. This Agreement continues until terminated. Either party may terminate this Agreement for convenience on sixty (60) days' written notice. Either party may terminate immediately if the other commits a material breach that is not remedied within thirty (30) days of notice.
[PAGE 3]
7. Notices. Notices must be in writing and delivered by email to the addresses in the signature block.
8. Governing Law and Disputes. This Agreement is governed by the laws of the State of Texas. The parties shall first attempt to resolve any dispute through good-faith negotiation between senior executives for 30 days, after which either party may bring proceedings in the state or federal courts located in Travis County, Texas.`,
    expected: {
      detected_contract_type: 'msa',
      terms: [
        { term_key: 'parties', value: 'Northwind Retail LLC (Texas LLC) as Client and Pixelforge Studio Ltd (England and Wales) as Provider.', page_number: 1, confidence: 0.96, source_sentence: 'This Master Services Agreement ("Agreement") is made between Northwind Retail LLC, a Texas limited liability company ("Client"), and Pixelforge Studio Ltd, a company registered in England and Wales ("Provider").' },
        { term_key: 'service_scope', value: 'Design and development services as described in each executed Statement of Work.', page_number: 1, confidence: 0.9, source_sentence: 'Provider shall perform the design and development services described in each Statement of Work ("SOW") executed by the parties.' },
        { term_key: 'payment_terms', value: 'Fees per SOW; each undisputed invoice payable within 30 days of receipt.', page_number: 1, confidence: 0.92, source_sentence: 'Provider shall invoice Client monthly in arrears, and Client shall pay each undisputed invoice within thirty (30) days of receipt.' },
        { term_key: 'invoice_schedule', value: 'Monthly in arrears', page_number: 1, confidence: 0.95, source_sentence: 'Provider shall invoice Client monthly in arrears, and Client shall pay each undisputed invoice within thirty (30) days of receipt.' },
        { term_key: 'late_payment_penalty', value: 'Interest of 1.5% per month on overdue amounts.', page_number: 1, confidence: 0.95, source_sentence: 'Overdue amounts shall accrue interest at 1.5% per month.' },
        { term_key: 'liability_cap', value: 'Each party capped at fees paid in the 12 months before the claim (indemnity excluded); no liability for indirect or consequential loss or lost profits.', page_number: 2, confidence: 0.9, source_sentence: "Except for the indemnity in Clause 4, each party's total liability under this Agreement shall not exceed the fees paid by Client in the twelve (12) months preceding the claim." },
        { term_key: 'indemnification', value: 'Provider indemnifies Client against third-party IP infringement claims about the deliverables.', page_number: 2, confidence: 0.93, source_sentence: "Provider shall indemnify Client against any third-party claim that the deliverables infringe that third party's intellectual property rights." },
        { term_key: 'ip_ownership', value: 'Deliverables assigned to Client on full payment; Provider keeps pre-existing tools and know-how and licenses them non-exclusively to Client.', page_number: 2, confidence: 0.9, source_sentence: 'Upon full payment, Provider assigns to Client all rights in the deliverables created under an SOW.' },
        { term_key: 'termination_clause', value: "Either party: for convenience on 60 days' written notice, or immediately for material breach not remedied within 30 days of notice. No auto-renewal (continues until terminated).", page_number: 2, confidence: 0.88, source_sentence: "Either party may terminate this Agreement for convenience on sixty (60) days' written notice." },
        { term_key: 'governing_law', value: 'Laws of the State of Texas', page_number: 3, confidence: 0.97, source_sentence: 'This Agreement is governed by the laws of the State of Texas.' },
        { term_key: 'dispute_resolution', value: '30 days of good-faith negotiation between senior executives, then proceedings in state or federal courts in Travis County, Texas.', page_number: 3, confidence: 0.9, source_sentence: 'The parties shall first attempt to resolve any dispute through good-faith negotiation between senior executives for 30 days, after which either party may bring proceedings in the state or federal courts located in Travis County, Texas.' },
        { term_key: 'notice_period', value: "60 days' written notice for termination for convenience; notices in writing by email to signature-block addresses.", page_number: 2, confidence: 0.78, source_sentence: "Either party may terminate this Agreement for convenience on sixty (60) days' written notice." },
      ],
    },
  },
  {
    id: 'msa-2-uk-framework',
    contractType: 'msa',
    excerpt: `[PAGE 1]
FRAMEWORK SERVICES AGREEMENT
This Agreement is made on 2 June 2025 between Kestrel Housing Association Limited (registered society no. 7741) (the "Customer") and Tallis Digital Services Ltd (company number 11223344) (the "Supplier").
1. The Supplier shall provide IT support and hosting services in accordance with the service descriptions set out in Schedule 1.
2. The Customer shall pay the Charges in pounds sterling within forty-five (45) days of the date of a valid invoice. The Supplier shall invoice the Charges quarterly in advance.
[PAGE 2]
3. The Supplier's total aggregate liability arising under or in connection with this Agreement shall be limited to 125% of the Charges paid or payable in the Contract Year in which the claim arose. Nothing in this Agreement limits liability for death or personal injury caused by negligence or for fraud.
4. The Supplier shall indemnify the Customer against all losses arising from any breach by the Supplier of its data protection obligations.
5. All Intellectual Property Rights in materials created by the Supplier specifically for the Customer shall vest in the Customer on creation.
[PAGE 3]
6. Either party may terminate this Agreement by giving not less than three (3) months' written notice to the other. The Customer may terminate immediately if the Supplier suffers an insolvency event.
7. Any dispute shall first be referred to the parties' relationship managers and may then, if the parties agree, be referred to mediation.
8. Notices shall be sent by recorded delivery to the registered office of the receiving party.
9. This Agreement is governed by the law of England and Wales.`,
    expected: {
      detected_contract_type: 'msa',
      terms: [
        { term_key: 'parties', value: 'Kestrel Housing Association Limited (registered society no. 7741) as Customer and Tallis Digital Services Ltd (11223344) as Supplier.', page_number: 1, confidence: 0.94, source_sentence: 'This Agreement is made on 2 June 2025 between Kestrel Housing Association Limited (registered society no. 7741) (the "Customer") and Tallis Digital Services Ltd (company number 11223344) (the "Supplier").' },
        { term_key: 'service_scope', value: 'IT support and hosting services as described in Schedule 1.', page_number: 1, confidence: 0.88, source_sentence: 'The Supplier shall provide IT support and hosting services in accordance with the service descriptions set out in Schedule 1.' },
        { term_key: 'payment_terms', value: 'Charges in GBP, payable within 45 days of a valid invoice.', page_number: 1, confidence: 0.92, source_sentence: 'The Customer shall pay the Charges in pounds sterling within forty-five (45) days of the date of a valid invoice.' },
        { term_key: 'invoice_schedule', value: 'Quarterly in advance', page_number: 1, confidence: 0.95, source_sentence: 'The Supplier shall invoice the Charges quarterly in advance.' },
        { term_key: 'late_payment_penalty', value: null, page_number: null, confidence: 0.1, source_sentence: null },
        { term_key: 'liability_cap', value: "Supplier's total liability capped at 125% of Charges paid or payable in the Contract Year of the claim; liability for death or personal injury from negligence, and for fraud, is not limited.", page_number: 2, confidence: 0.9, source_sentence: "The Supplier's total aggregate liability arising under or in connection with this Agreement shall be limited to 125% of the Charges paid or payable in the Contract Year in which the claim arose." },
        { term_key: 'indemnification', value: "Supplier indemnifies Customer for losses from the Supplier's breach of its data protection obligations.", page_number: 2, confidence: 0.9, source_sentence: 'The Supplier shall indemnify the Customer against all losses arising from any breach by the Supplier of its data protection obligations.' },
        { term_key: 'ip_ownership', value: "IP in materials created specifically for the Customer vests in the Customer on creation; the Supplier's pre-existing IP is not addressed.", page_number: 2, confidence: 0.87, source_sentence: 'All Intellectual Property Rights in materials created by the Supplier specifically for the Customer shall vest in the Customer on creation.' },
        { term_key: 'termination_clause', value: "Either party on at least 3 months' written notice; the Customer may terminate immediately on Supplier insolvency.", page_number: 3, confidence: 0.9, source_sentence: "Either party may terminate this Agreement by giving not less than three (3) months' written notice to the other." },
        { term_key: 'governing_law', value: 'Law of England and Wales', page_number: 3, confidence: 0.96, source_sentence: 'This Agreement is governed by the law of England and Wales.' },
        { term_key: 'dispute_resolution', value: 'Referral to relationship managers, then mediation only if both parties agree; no court or arbitration forum is specified.', page_number: 3, confidence: 0.6, source_sentence: "Any dispute shall first be referred to the parties' relationship managers and may then, if the parties agree, be referred to mediation." },
        { term_key: 'notice_period', value: "3 months' written notice for termination; formal notices by recorded delivery to the registered office.", page_number: 3, confidence: 0.85, source_sentence: "Either party may terminate this Agreement by giving not less than three (3) months' written notice to the other." },
      ],
    },
  },
  {
    id: 'msa-3-us-saas',
    contractType: 'msa',
    excerpt: `[PAGE 1]
MASTER SUBSCRIPTION AND SERVICES AGREEMENT
This Master Subscription and Services Agreement (the "Agreement") is entered into by and between Brightwater Clinics, P.C., a California professional corporation ("Customer"), and Orbitline Software, Inc., a Delaware corporation ("Vendor").
1. Services. Vendor will provide access to its scheduling platform and the implementation services described in an applicable Order Form.
2. Fees. Customer will pay the fees stated in each Order Form in U.S. dollars. Invoices are due net thirty (30) days.
[PAGE 2]
3. Invoicing. Vendor will invoice subscription fees annually in advance and implementation fees upon completion of the applicable milestone.
4. Late Payment. If any undisputed amount is more than fifteen (15) days overdue, Vendor may, after ten (10) days' written notice, suspend Customer's access until the amount is paid.
5. Ownership. Vendor owns the platform and all improvements to it. Customer owns all patient data that Customer uploads to the platform.
6. Limitation of Liability. In no event will either party's aggregate liability exceed the amounts paid or payable by Customer under the applicable Order Form in the twelve (12) months before the event giving rise to liability.
[PAGE 3]
7. Indemnification. Each party will defend and indemnify the other against third-party claims arising from its gross negligence or willful misconduct.
8. Term and Renewal. Each Order Form renews automatically for successive one-year terms unless either party gives notice of non-renewal at least sixty (60) days before the end of the then-current term.
9. Governing Law. This Agreement is governed by the laws of the State of California.
10. Arbitration. Any dispute will be resolved by binding arbitration administered by JAMS in San Francisco, California.`,
    expected: {
      detected_contract_type: 'msa',
      terms: [
        { term_key: 'parties', value: 'Brightwater Clinics, P.C. (California professional corporation) as Customer and Orbitline Software, Inc. (Delaware) as Vendor.', page_number: 1, confidence: 0.95, source_sentence: 'This Master Subscription and Services Agreement (the "Agreement") is entered into by and between Brightwater Clinics, P.C., a California professional corporation ("Customer"), and Orbitline Software, Inc., a Delaware corporation ("Vendor").' },
        { term_key: 'service_scope', value: "Access to the Vendor's scheduling platform plus implementation services as described in each Order Form.", page_number: 1, confidence: 0.88, source_sentence: 'Vendor will provide access to its scheduling platform and the implementation services described in an applicable Order Form.' },
        { term_key: 'payment_terms', value: 'Fees per Order Form in US dollars; invoices due net 30 days.', page_number: 1, confidence: 0.9, source_sentence: 'Customer will pay the fees stated in each Order Form in U.S. dollars. Invoices are due net thirty (30) days.' },
        { term_key: 'invoice_schedule', value: 'Subscription fees annually in advance; implementation fees on milestone completion.', page_number: 2, confidence: 0.93, source_sentence: 'Vendor will invoice subscription fees annually in advance and implementation fees upon completion of the applicable milestone.' },
        { term_key: 'late_payment_penalty', value: "No interest stated; the Vendor may suspend access if an undisputed amount is over 15 days overdue, after 10 days' written notice.", page_number: 2, confidence: 0.82, source_sentence: "If any undisputed amount is more than fifteen (15) days overdue, Vendor may, after ten (10) days' written notice, suspend Customer's access until the amount is paid." },
        { term_key: 'liability_cap', value: 'Each party capped at amounts paid or payable under the relevant Order Form in the 12 months before the event.', page_number: 2, confidence: 0.88, source_sentence: "In no event will either party's aggregate liability exceed the amounts paid or payable by Customer under the applicable Order Form in the twelve (12) months before the event giving rise to liability." },
        { term_key: 'indemnification', value: 'Mutual: each party defends and indemnifies the other against third-party claims from its gross negligence or wilful misconduct.', page_number: 3, confidence: 0.9, source_sentence: 'Each party will defend and indemnify the other against third-party claims arising from its gross negligence or willful misconduct.' },
        { term_key: 'ip_ownership', value: 'Vendor owns the platform and all improvements; Customer owns the patient data it uploads.', page_number: 2, confidence: 0.9, source_sentence: 'Vendor owns the platform and all improvements to it. Customer owns all patient data that Customer uploads to the platform.' },
        { term_key: 'termination_clause', value: 'Order Forms auto-renew for 1-year terms unless non-renewal notice is given at least 60 days before term end; no termination for convenience or for breach is stated.', page_number: 3, confidence: 0.62, source_sentence: 'Each Order Form renews automatically for successive one-year terms unless either party gives notice of non-renewal at least sixty (60) days before the end of the then-current term.' },
        { term_key: 'governing_law', value: 'Laws of the State of California', page_number: 3, confidence: 0.97, source_sentence: 'This Agreement is governed by the laws of the State of California.' },
        { term_key: 'dispute_resolution', value: 'Binding arbitration administered by JAMS in San Francisco, California.', page_number: 3, confidence: 0.93, source_sentence: 'Any dispute will be resolved by binding arbitration administered by JAMS in San Francisco, California.' },
        { term_key: 'notice_period', value: 'Non-renewal notice at least 60 days before the end of the current term; no method for delivering notices is stated.', page_number: 3, confidence: 0.8, source_sentence: 'Each Order Form renews automatically for successive one-year terms unless either party gives notice of non-renewal at least sixty (60) days before the end of the then-current term.' },
      ],
    },
  },
];
