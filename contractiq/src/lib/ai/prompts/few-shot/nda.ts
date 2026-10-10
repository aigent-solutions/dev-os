import type { FewShotExample } from '../types';

// NDA few-shot examples (05 §6.7). Example 1 is verbatim from the spec. Examples 2 and 3 are synthetic
// (fictional parties) and cover the spec's rules across the set: a not-found term, sources on page ≥ 2,
// ambiguous terms at 0.50–0.69, US (ex 2) and UK (ex 1, 3) drafting. Every source_sentence appears
// verbatim in its excerpt (checked by tests/unit/lib/ai/prompts).
export const NDA_FEW_SHOT: FewShotExample[] = [
  {
    id: 'nda-1-uk-mutual',
    contractType: 'nda',
    excerpt: `[PAGE 1]
MUTUAL NON-DISCLOSURE AGREEMENT
This Mutual Non-Disclosure Agreement (the "Agreement") is entered into as of 3 February 2025 (the "Effective Date") between Brightline Analytics Ltd, a company registered in England and Wales (company no. 10293847) ("Brightline"), and Corva Health Inc., a Delaware corporation ("Corva"). Each party may disclose Confidential Information to the other and is a "Disclosing Party" and a "Receiving Party".
1. Obligations. The Receiving Party shall use the Confidential Information solely for the purpose of evaluating a potential data-analytics partnership (the "Purpose") and shall protect it using at least the same degree of care it uses for its own confidential information, and in no event less than reasonable care.
2. Exceptions. The Receiving Party may disclose Confidential Information to its employees and professional advisers who need to know it for the Purpose and are bound by obligations of confidentiality no less protective than this Agreement. Confidential Information does not include information that is or becomes publicly available through no fault of the Receiving Party.
[PAGE 2]
3. Compelled Disclosure. If the Receiving Party is required by law or court order to disclose Confidential Information, it shall give the Disclosing Party prompt written notice where legally permitted.
4. Term. This Agreement shall remain in force for two (2) years from the Effective Date. The obligations in Clause 1 shall survive for three (3) years after expiry or termination.
5. No Licence. All Confidential Information remains the property of the Disclosing Party, and nothing in this Agreement grants any licence under any patent, copyright or other intellectual property right.
6. Remedies. Each party acknowledges that damages alone may not be an adequate remedy for breach and that the Disclosing Party shall be entitled to seek injunctive relief. On request, the Receiving Party shall promptly return or destroy all Confidential Information.
7. Law and Jurisdiction. This Agreement is governed by the laws of England and Wales, and the courts of England shall have exclusive jurisdiction.`,
    expected: {
      detected_contract_type: 'nda',
      terms: [
        { term_key: 'parties', value: 'Brightline Analytics Ltd (England and Wales, company no. 10293847) and Corva Health Inc. (Delaware); mutual — each is both Disclosing and Receiving Party.', page_number: 1, confidence: 0.96, source_sentence: 'This Mutual Non-Disclosure Agreement (the "Agreement") is entered into as of 3 February 2025 (the "Effective Date") between Brightline Analytics Ltd, a company registered in England and Wales (company no. 10293847) ("Brightline"), and Corva Health Inc., a Delaware corporation ("Corva").' },
        { term_key: 'effective_date', value: '3 February 2025', page_number: 1, confidence: 0.97, source_sentence: 'This Mutual Non-Disclosure Agreement (the "Agreement") is entered into as of 3 February 2025 (the "Effective Date") between Brightline Analytics Ltd, a company registered in England and Wales (company no. 10293847) ("Brightline"), and Corva Health Inc., a Delaware corporation ("Corva").' },
        { term_key: 'confidentiality_obligations', value: 'Use only to evaluate a potential data-analytics partnership; protect with at least the care used for own confidential information and no less than reasonable care.', page_number: 1, confidence: 0.93, source_sentence: 'The Receiving Party shall use the Confidential Information solely for the purpose of evaluating a potential data-analytics partnership (the "Purpose") and shall protect it using at least the same degree of care it uses for its own confidential information, and in no event less than reasonable care.' },
        { term_key: 'permitted_disclosures', value: 'Employees and professional advisers with a need to know who are bound by equivalent confidentiality; publicly available information excluded; disclosure required by law or court order allowed with prompt written notice.', page_number: 1, confidence: 0.82, source_sentence: 'The Receiving Party may disclose Confidential Information to its employees and professional advisers who need to know it for the Purpose and are bound by obligations of confidentiality no less protective than this Agreement.' },
        { term_key: 'term_duration', value: '2 years from the Effective Date; confidentiality obligations survive 3 years after expiry or termination.', page_number: 2, confidence: 0.95, source_sentence: 'This Agreement shall remain in force for two (2) years from the Effective Date. The obligations in Clause 1 shall survive for three (3) years after expiry or termination.' },
        { term_key: 'governing_law', value: 'Laws of England and Wales', page_number: 2, confidence: 0.97, source_sentence: 'This Agreement is governed by the laws of England and Wales, and the courts of England shall have exclusive jurisdiction.' },
        { term_key: 'jurisdiction', value: 'Exclusive jurisdiction of the courts of England', page_number: 2, confidence: 0.95, source_sentence: 'This Agreement is governed by the laws of England and Wales, and the courts of England shall have exclusive jurisdiction.' },
        { term_key: 'ip_ownership', value: 'Confidential Information stays the property of the Disclosing Party; no licence to patents, copyright or other IP is granted.', page_number: 2, confidence: 0.92, source_sentence: 'All Confidential Information remains the property of the Disclosing Party, and nothing in this Agreement grants any licence under any patent, copyright or other intellectual property right.' },
        { term_key: 'non_solicitation', value: null, page_number: null, confidence: 0.1, source_sentence: null },
        { term_key: 'breach_remedy', value: 'Disclosing Party may seek injunctive relief (damages may be inadequate); Receiving Party must return or destroy information on request.', page_number: 2, confidence: 0.88, source_sentence: 'Each party acknowledges that damages alone may not be an adequate remedy for breach and that the Disclosing Party shall be entitled to seek injunctive relief.' },
      ],
    },
  },
  {
    id: 'nda-2-us-one-way',
    contractType: 'nda',
    excerpt: `[PAGE 1]
CONFIDENTIALITY AGREEMENT
This Confidentiality Agreement (this "Agreement") is effective as of the date of the last signature below and is between Harbor Point Logistics, Inc., a New York corporation ("Discloser"), and Quillon Data LLC, a Delaware limited liability company ("Recipient").
1. Confidentiality. Recipient shall hold all Confidential Information in strict confidence, shall not disclose it to any third party, and shall use it only to prepare a proposal for warehouse automation services.
2. Disclosure to Representatives. Recipient may share Confidential Information with its officers and employees who have a need to know and who have been informed of its confidential nature.
3. Excluded Information. The obligations above do not apply to information that Recipient can show was already in its possession before disclosure or was independently developed without use of the Confidential Information.
[PAGE 2]
4. Duration. This Agreement continues until either party terminates it by written notice, and Recipient's obligations shall continue for a reasonable period thereafter.
5. Non-Solicitation. For twelve (12) months after the Effective Date, Recipient shall not solicit for employment any employee of Discloser with whom Recipient had contact in connection with the proposal.
6. Remedies. Any breach of this Agreement will cause irreparable harm, and Discloser shall be entitled to equitable relief, including an injunction, without posting a bond.
[PAGE 3]
7. Governing Law; Venue. This Agreement shall be governed by the laws of the State of New York. Any action arising out of this Agreement shall be brought exclusively in the state or federal courts located in New York County, New York.`,
    expected: {
      detected_contract_type: 'nda',
      terms: [
        { term_key: 'parties', value: 'Harbor Point Logistics, Inc. (New York corporation) as Discloser and Quillon Data LLC (Delaware LLC) as Recipient; one-way.', page_number: 1, confidence: 0.95, source_sentence: 'This Confidentiality Agreement (this "Agreement") is effective as of the date of the last signature below and is between Harbor Point Logistics, Inc., a New York corporation ("Discloser"), and Quillon Data LLC, a Delaware limited liability company ("Recipient").' },
        { term_key: 'effective_date', value: 'Date of the last signature', page_number: 1, confidence: 0.86, source_sentence: 'This Confidentiality Agreement (this "Agreement") is effective as of the date of the last signature below and is between Harbor Point Logistics, Inc., a New York corporation ("Discloser"), and Quillon Data LLC, a Delaware limited liability company ("Recipient").' },
        { term_key: 'confidentiality_obligations', value: 'Hold in strict confidence, no disclosure to third parties, and use only to prepare a warehouse automation proposal.', page_number: 1, confidence: 0.92, source_sentence: 'Recipient shall hold all Confidential Information in strict confidence, shall not disclose it to any third party, and shall use it only to prepare a proposal for warehouse automation services.' },
        { term_key: 'permitted_disclosures', value: 'Officers and employees with a need to know who are told it is confidential; information already possessed or independently developed is excluded.', page_number: 1, confidence: 0.8, source_sentence: 'Recipient may share Confidential Information with its officers and employees who have a need to know and who have been informed of its confidential nature.' },
        { term_key: 'term_duration', value: 'Until terminated by written notice; obligations continue for an unspecified "reasonable period" afterwards.', page_number: 2, confidence: 0.58, source_sentence: "This Agreement continues until either party terminates it by written notice, and Recipient's obligations shall continue for a reasonable period thereafter." },
        { term_key: 'governing_law', value: 'Laws of the State of New York', page_number: 3, confidence: 0.97, source_sentence: 'This Agreement shall be governed by the laws of the State of New York.' },
        { term_key: 'jurisdiction', value: 'Exclusive jurisdiction of the state or federal courts in New York County, New York', page_number: 3, confidence: 0.94, source_sentence: 'Any action arising out of this Agreement shall be brought exclusively in the state or federal courts located in New York County, New York.' },
        { term_key: 'ip_ownership', value: null, page_number: null, confidence: 0.15, source_sentence: null },
        { term_key: 'non_solicitation', value: "Recipient may not solicit for employment any Discloser employee it dealt with on the proposal, for 12 months after the Effective Date.", page_number: 2, confidence: 0.93, source_sentence: 'For twelve (12) months after the Effective Date, Recipient shall not solicit for employment any employee of Discloser with whom Recipient had contact in connection with the proposal.' },
        { term_key: 'breach_remedy', value: 'Discloser is entitled to equitable relief, including an injunction, without posting a bond.', page_number: 2, confidence: 0.9, source_sentence: 'Any breach of this Agreement will cause irreparable harm, and Discloser shall be entitled to equitable relief, including an injunction, without posting a bond.' },
      ],
    },
  },
  {
    id: 'nda-3-uk-scots',
    contractType: 'nda',
    excerpt: `[PAGE 1]
NON-DISCLOSURE AGREEMENT
This Agreement is dated 14 August 2025 and is made between Ashgrove Engineering Limited (company number SC604417), whose registered office is at 12 Canal Street, Glasgow ("Ashgrove"), and Ferrow Medical Devices Ltd (company number 08812345) ("Ferrow").
1. Each party shall keep the other party's Confidential Information confidential and shall not use it except to discuss a possible joint development of surgical tooling.
2. A party may disclose Confidential Information to the extent required by law or by any regulatory authority, provided that it informs the other party as soon as reasonably practicable.
[PAGE 2]
3. This Agreement shall terminate on the earlier of the signature of a development contract and 31 December 2026; the obligations of confidentiality shall survive termination for five (5) years.
4. Any know-how, inventions or improvements developed jointly during the discussions shall be owned by the parties in equal shares unless agreed otherwise in writing.
5. Neither party shall, during the term of this Agreement, solicit or entice away any customer of the other party introduced to it through the discussions.
[PAGE 3]
6. A party in breach shall indemnify the other against all losses arising from any unauthorised disclosure of Confidential Information.
7. This Agreement is governed by Scots law.`,
    expected: {
      detected_contract_type: 'nda',
      terms: [
        { term_key: 'parties', value: 'Ashgrove Engineering Limited (SC604417, Glasgow) and Ferrow Medical Devices Ltd (08812345); mutual obligations.', page_number: 1, confidence: 0.9, source_sentence: 'This Agreement is dated 14 August 2025 and is made between Ashgrove Engineering Limited (company number SC604417), whose registered office is at 12 Canal Street, Glasgow ("Ashgrove"), and Ferrow Medical Devices Ltd (company number 08812345) ("Ferrow").' },
        { term_key: 'effective_date', value: '14 August 2025', page_number: 1, confidence: 0.88, source_sentence: 'This Agreement is dated 14 August 2025 and is made between Ashgrove Engineering Limited (company number SC604417), whose registered office is at 12 Canal Street, Glasgow ("Ashgrove"), and Ferrow Medical Devices Ltd (company number 08812345) ("Ferrow").' },
        { term_key: 'confidentiality_obligations', value: "Each party keeps the other's information confidential and uses it only to discuss a possible joint development of surgical tooling.", page_number: 1, confidence: 0.9, source_sentence: "Each party shall keep the other party's Confidential Information confidential and shall not use it except to discuss a possible joint development of surgical tooling." },
        { term_key: 'permitted_disclosures', value: 'Disclosure required by law or a regulator, informing the other party as soon as reasonably practicable.', page_number: 1, confidence: 0.85, source_sentence: 'A party may disclose Confidential Information to the extent required by law or by any regulatory authority, provided that it informs the other party as soon as reasonably practicable.' },
        { term_key: 'term_duration', value: 'Ends on the earlier of signing a development contract or 31 December 2026; confidentiality survives 5 years after termination.', page_number: 2, confidence: 0.92, source_sentence: 'This Agreement shall terminate on the earlier of the signature of a development contract and 31 December 2026; the obligations of confidentiality shall survive termination for five (5) years.' },
        { term_key: 'governing_law', value: 'Scots law', page_number: 3, confidence: 0.95, source_sentence: 'This Agreement is governed by Scots law.' },
        { term_key: 'jurisdiction', value: null, page_number: null, confidence: 0.15, source_sentence: null },
        { term_key: 'ip_ownership', value: "Jointly developed know-how, inventions and improvements are owned in equal shares unless agreed otherwise in writing; ownership of each party's own information is not stated.", page_number: 2, confidence: 0.64, source_sentence: 'Any know-how, inventions or improvements developed jointly during the discussions shall be owned by the parties in equal shares unless agreed otherwise in writing.' },
        { term_key: 'non_solicitation', value: "During the term, neither party may solicit or entice away the other's customers introduced through the discussions (employees are not covered).", page_number: 2, confidence: 0.84, source_sentence: 'Neither party shall, during the term of this Agreement, solicit or entice away any customer of the other party introduced to it through the discussions.' },
        { term_key: 'breach_remedy', value: 'The breaching party indemnifies the other against losses from any unauthorised disclosure.', page_number: 3, confidence: 0.86, source_sentence: 'A party in breach shall indemnify the other against all losses arising from any unauthorised disclosure of Confidential Information.' },
      ],
    },
  },
];
