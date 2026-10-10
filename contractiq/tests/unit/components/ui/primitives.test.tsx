import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Info } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FieldError } from '@/components/ui/FieldError';
import { IconButton } from '@/components/ui/IconButton';
import { Tooltip, TooltipProvider } from '@/components/ui/Tooltip';

// 00-foundation.md §12.2 — UI primitives.
describe('Button', () => {
  it('loading → aria-busy and disabled', () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toBeDisabled();
  });
  it('defaults to type="button" (never submits a form by accident)', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('IconButton', () => {
  it('label is the accessible name; the icon is hidden from assistive tech', () => {
    const { container } = render(<IconButton icon={Info} label="What is Governing Law?" />);
    expect(screen.getByRole('button', { name: 'What is Governing Law?' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('FieldError', () => {
  it('has role="alert" and the given id', () => {
    render(<FieldError id="email-error" message="Enter your email" />);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'email-error');
  });
  it('renders nothing without a message', () => {
    const { container } = render(<FieldError id="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConfirmDialog', () => {
  it('with confirmText, the confirm button stays disabled until it matches exactly', async () => {
    const onConfirm = vi.fn(async () => undefined);
    render(<ConfirmDialog open onOpenChange={() => undefined} title="Delete?" body="Sure?" confirmLabel="Delete" tone="danger" confirmText="DELETE" onConfirm={onConfirm} />);
    const user = userEvent.setup();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText('Type DELETE to confirm'));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Tooltip', () => {
  it('opens on keyboard focus', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Plain-English explanation">
          <button type="button">ⓘ</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.setup().tab();
    await waitFor(() => expect(screen.getAllByText('Plain-English explanation').length).toBeGreaterThan(0));
  });
});

describe('Banner', () => {
  it('without onDismiss there is no close button', () => {
    render(<Banner tone="info">Not legal advice</Banner>);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('with onDismiss, the close button uses dismissLabel', async () => {
    const onDismiss = vi.fn();
    render(<Banner tone="warning" onDismiss={onDismiss} dismissLabel="Dismiss warning">x</Banner>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(onDismiss).toHaveBeenCalled();
  });
  it('danger banners are role="alert", others role="status"', () => {
    render(<><Banner tone="danger">a</Banner><Banner tone="info">b</Banner></>);
    expect(screen.getByRole('alert')).toHaveTextContent('a');
    expect(screen.getByRole('status')).toHaveTextContent('b');
  });
});

describe('Badge', () => {
  it.each([
    ['neutral', 'text-fg-secondary'], ['brand', 'text-info-fg'], ['success', 'text-success-fg'],
    ['warning', 'text-warning-fg'], ['danger', 'text-danger-fg'], ['accent', 'text-accent-fg'],
  ] as [BadgeTone, string][])('%s → %s', (tone, cls) => {
    render(<Badge tone={tone}>t</Badge>);
    expect(screen.getByText('t')).toHaveClass(cls);
  });
});
