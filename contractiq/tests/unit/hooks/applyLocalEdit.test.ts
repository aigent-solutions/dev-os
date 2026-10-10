import { describe, expect, it } from 'vitest';
import { applyLocalEdit } from '@/hooks/useUpdateKeyTerm';
import { keyTerm } from '../../helpers/fixtures';

// 08-inline-editing.md §12 — the optimistic copy must match what the DB trigger will store.
describe('applyLocalEdit', () => {
  it('the first edit captures the AI value and page as the originals', () => {
    const t = applyLocalEdit(keyTerm({ value: 'England', page_number: 2 }), { termId: 't-1', value: 'Scotland', page_number: 3 });
    expect(t).toMatchObject({ value: 'Scotland', page_number: 3, is_edited: true, original_value: 'England', original_page_number: 2 });
    expect(t.edited_at).not.toBeNull();
  });

  it('a second edit keeps the first originals', () => {
    const once = applyLocalEdit(keyTerm({ value: 'England', page_number: 2 }), { termId: 't-1', value: 'Scotland' });
    const twice = applyLocalEdit(once, { termId: 't-1', value: 'Wales' });
    expect(twice).toMatchObject({ value: 'Wales', original_value: 'England', original_page_number: 2 });
  });

  it('unchanged input returns the same object', () => {
    const t = keyTerm();
    expect(applyLocalEdit(t, { termId: t.id, value: t.value! })).toBe(t);
  });

  it('an AI-null value: original_value stays null but is_edited becomes true', () => {
    const t = applyLocalEdit(keyTerm({ value: null, page_number: null }), { termId: 't-1', value: 'Found it', page_number: 1 });
    expect(t).toMatchObject({ value: 'Found it', is_edited: true, original_value: null, original_page_number: null });
  });
});
