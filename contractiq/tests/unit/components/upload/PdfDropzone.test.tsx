import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfDropzone } from '@/components/upload/PdfDropzone';

// 03-upload-extraction.md §12 — rejection mapping and the disabled state.
const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const drop = (files: File[]) =>
  fireEvent.drop(screen.getByRole('button', { name: 'Upload a contract PDF' }), {
    dataTransfer: { files, items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })), types: ['Files'] },
  });

function setup(disabled = false) {
  const onFile = vi.fn();
  const onReject = vi.fn();
  render(<PdfDropzone disabled={disabled} disabledReason="Choose a contract type first." onFile={onFile} onReject={onReject} />);
  return { onFile, onReject };
}

describe('PdfDropzone', () => {
  it('accepts a PDF', async () => {
    const { onFile } = setup();
    const f = file('nda.pdf', 'application/pdf');
    drop([f]);
    await waitFor(() => expect(onFile).toHaveBeenCalledWith(f));
  });

  // Factories, not File instances: Vitest can't format File objects in it.each titles.
  it.each([
    ['a non-PDF', () => [file('notes.txt', 'text/plain')], 'NOT_A_PDF'],
    ['a file over 10 MB', () => [file('big.pdf', 'application/pdf', 10_485_761)], 'FILE_TOO_LARGE'],
    ['two files', () => [file('a.pdf', 'application/pdf'), file('b.pdf', 'application/pdf')], 'TOO_MANY_FILES'],
  ] as const)('rejects %s → %s', async (_l, files, code) => {
    const { onReject, onFile } = setup();
    drop(files());
    await waitFor(() => expect(onReject).toHaveBeenCalledWith(code));
    expect(onFile).not.toHaveBeenCalled();
  });

  it('disabled until a type is chosen: not focusable, aria-disabled, explains why, ignores drops', async () => {
    const { onFile } = setup(true);
    const zone = screen.getByRole('button', { name: 'Upload a contract PDF' });
    expect(zone).toHaveAttribute('aria-disabled', 'true');
    expect(zone).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Choose a contract type first.')).toBeInTheDocument();
    drop([file('nda.pdf', 'application/pdf')]);
    await new Promise((r) => setTimeout(r, 50));
    expect(onFile).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('%j on the focused zone opens the file dialog', (key) => {
    setup();
    const input = screen.getByLabelText('Choose a contract PDF');
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Upload a contract PDF' }), { key });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('a key press on the disabled zone does nothing', () => {
    setup(true);
    const click = vi.spyOn(screen.getByLabelText('Choose a contract PDF'), 'click').mockImplementation(() => undefined);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Upload a contract PDF' }), { key: 'Enter' });
    expect(click).not.toHaveBeenCalled();
  });

  it('describes the limits for screen readers', () => {
    setup();
    const zone = screen.getByRole('button', { name: 'Upload a contract PDF' });
    expect(document.getElementById(zone.getAttribute('aria-describedby')!)).toHaveTextContent('PDF only · up to 10 MB · up to 20 pages');
  });
});
