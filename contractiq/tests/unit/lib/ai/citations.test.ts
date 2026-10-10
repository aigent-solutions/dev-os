import { describe, expect, it } from 'vitest';
import { parseCitations } from '@/lib/ai/citations';

// 09-contract-chat.md §12.
describe('parseCitations', () => {
  it('[Page 3] → [3]', () => {
    expect(parseCitations('Based on the document, 30 days [Page 3].', 12, 'contract')).toEqual({ citedPages: [3], isNotFound: false, citationMissing: false });
  });
  it('dedupes and sorts', () => {
    expect(parseCitations('a [Page 7] b [Page 2] c [Page 7] d [page 2]', 12, 'contract').citedPages).toEqual([2, 7]);
  });
  it('drops [Page 0] and pages past pageCount', () => {
    expect(parseCitations('[Page 0] [Page 99] [Page 12] [Page 13]', 12, 'contract').citedPages).toEqual([12]);
  });
  it('is case-insensitive', () => {
    expect(parseCitations('[PAGE 4] and [page 5]', 12, 'contract').citedPages).toEqual([4, 5]);
  });
  it('keeps every page when pageCount is unknown', () => {
    expect(parseCitations('[Page 40]', null, 'contract').citedPages).toEqual([40]);
  });
  it('detects the not-found answer, which is never "citation missing"', () => {
    expect(parseCitations('I cannot find this in the document.', 12, 'contract')).toEqual({ citedPages: [], isNotFound: true, citationMissing: false });
  });
  it('a contract answer without a valid citation → citationMissing', () => {
    expect(parseCitations('Based on the document, it is 30 days.', 12, 'contract').citationMissing).toBe(true);
    expect(parseCitations('Based on the document, it is 30 days [Page 99].', 12, 'both').citationMissing).toBe(true);
  });
  it('citationMissing is false for history questions', () => {
    expect(parseCitations('Earlier I said 30 days.', 12, 'history').citationMissing).toBe(false);
  });
});
