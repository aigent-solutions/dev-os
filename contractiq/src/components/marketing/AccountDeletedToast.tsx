'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/Toast';

/** After account deletion (13 §8.6): one toast, then the query param is removed. Wrap in <Suspense>. */
export function AccountDeletedToast() {
  const router = useRouter();
  const params = useSearchParams();
  const shown = useRef(false);
  const deleted = params.get('account_deleted') === '1';

  useEffect(() => {
    if (!deleted || shown.current) return;
    shown.current = true;
    toast({ title: 'Your account and all data have been deleted', tone: 'success' });
    router.replace('/', { scroll: false });
  }, [deleted, router]);

  return null;
}
