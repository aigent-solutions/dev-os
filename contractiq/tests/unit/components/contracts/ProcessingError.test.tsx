import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProcessingError } from '@/components/contracts/ProcessingError';
import { renderWithClient } from '../../../helpers/render';

// 05-key-term-extraction.md §12.
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
const error = { code: 'OPENAI_UNAVAILABLE', message: 'The AI service is busy. Please try again.' };

describe('ProcessingError', () => {
  it('attempts < 5: shows the message and Try again; sets data-error-code', () => {
    renderWithClient(<ProcessingError contractId="c" error={error} attempts={4} customTerms={[]} />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-error-code', 'OPENAI_UNAVAILABLE');
    expect(screen.getByText(error.message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upload again' })).toBeNull();
  });

  it('attempts = 5: no retry, "Upload again" link instead', () => {
    renderWithClient(<ProcessingError contractId="c" error={error} attempts={5} customTerms={[]} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Upload again' })).toHaveAttribute('href', '/contracts/new');
    expect(screen.getByText('This contract has failed too many times.')).toBeInTheDocument();
  });
});
