import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must know the custom font-size names, otherwise `text-body-sm text-fg-primary`
// would be treated as two conflicting `text-*` colour classes and one would be dropped.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['h1', 'h2', 'h3', 'h4', 'h5', 'body-lg', 'body-sm'] }],
    },
  },
});

export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}

/** NFKD-normalise, strip diacritics, lowercase, non-alphanumerics → '_', trim '_', max 50 chars. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
    .replace(/_+$/g, '');
}

/** Strip a trailing .pdf, slugify, fall back to 'contract', cap at 80 chars, append .pdf. */
export function safeFileName(original: string): string {
  const base = slugify(original.replace(/\.pdf$/i, '')) || 'contract';
  return `${base.slice(0, 80)}.pdf`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
