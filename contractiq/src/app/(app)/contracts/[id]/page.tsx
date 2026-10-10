import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { ContractView } from '@/components/contracts/ContractView';
import { logger } from '@/lib/logger';
import { createServerSupabase } from '@/lib/supabase/server';
import { getContractDetail } from '@/server/services/contracts.service';

export const metadata: Metadata = { title: 'Contract' };
export const dynamic = 'force-dynamic';

// Results page (06 §6.3). The user-scoped client means another user's contract is simply not found.
export default async function ContractPage({ params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/contracts/${params.id}`);

  const detail = await getContractDetail(supabase, user.id, params.id, logger.child({ contract_id: params.id, user_id: user.id }));
  if (!detail) notFound();

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-6 md:px-6">
      <ContractView contractId={params.id} initialData={detail} />
    </div>
  );
}
