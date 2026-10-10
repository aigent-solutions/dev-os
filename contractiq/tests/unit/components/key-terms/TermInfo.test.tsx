import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GlossaryInfo, TermInfo } from '@/components/key-terms/TermInfo';
import { GLOSSARY } from '@/lib/glossary';
import { renderWithClient } from '../../../helpers/render';

// 14-onboarding-a11y.md §13.
describe('TermInfo', () => {
  it('accessible name "What is Governing Law?"; the tooltip opens on keyboard focus; Esc closes it', async () => {
    renderWithClient(<TermInfo label="Governing Law" description="Which country's laws apply." />);
    const button = screen.getByRole('button', { name: 'What is Governing Law?' });
    const user = userEvent.setup();
    await user.tab();
    expect(button).toHaveFocus();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent("Which country's laws apply."));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(button).toHaveFocus(); // Esc dismisses without moving focus (WCAG 1.4.13)
  });

  it('GlossaryInfo uses the GLOSSARY text', async () => {
    renderWithClient(<GlossaryInfo term="confidence" label="confidence" />);
    await userEvent.setup().tab();
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(GLOSSARY.confidence));
  });
});
