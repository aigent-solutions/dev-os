import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from '@/components/marketing/Footer';

// 02-landing.md §12 — the required attribution (PRD §11).
describe('Footer', () => {
  it('shows "Powered by OpenAI GPT-4o"', () => {
    render(<Footer />);
    expect(screen.getByText('Powered by OpenAI GPT-4o')).toBeInTheDocument();
  });

  it('links to Terms and Privacy', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });

  it('shows the current year and is a footer landmark', () => {
    render(<Footer />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`© ${new Date().getFullYear()} ContractIQ`);
  });
});
