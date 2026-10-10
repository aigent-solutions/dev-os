import { AppError } from '@/lib/api/errors';

// Checked before any service-role Storage call (README §3.9, 13-data-lifecycle-gdpr.md §6.2).
export function isContractPath(path: string, userId: string, contractId: string): boolean {
  return path.startsWith(`${userId}/${contractId}/`) && !path.includes('..') && path.split('/').length === 3;
}

export function assertContractPath(path: string, userId: string, contractId: string): void {
  if (!isContractPath(path, userId, contractId)) {
    throw new AppError('FORBIDDEN', 403, "You don't have access to this.", false, { reason: 'path_mismatch' });
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
