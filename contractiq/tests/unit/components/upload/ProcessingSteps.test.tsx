import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProcessingSteps } from '@/components/upload/ProcessingSteps';

// 05-key-term-extraction.md §12.
const states = () => screen.getAllByRole('listitem').map((li) => [li.textContent, li.getAttribute('aria-current')]);

describe('ProcessingSteps', () => {
  it.each([
    [1, ['Extracting text(in progress)', 'step'], ['Analysing with AI(not started)', null]],
    [2, ['Extracting text(done)', null], ['Analysing with AI(in progress)', 'step']],
    [3, ['Extracting text(done)', null], ['Compiling results(in progress)', 'step']],
  ] as const)('current=%i', (current, first, check) => {
    render(<ProcessingSteps current={current} />);
    const s = states();
    expect(s[0]).toEqual(first);
    expect(s.some(([t, a]) => t === check[0] && a === check[1])).toBe(true);
    expect(s.filter(([, a]) => a === 'step')).toHaveLength(1);
  });

  it('done: every step done, none current', () => {
    render(<ProcessingSteps current={3} done />);
    expect(states().every(([t, a]) => t!.endsWith('(done)') && a === null)).toBe(true);
  });
});
