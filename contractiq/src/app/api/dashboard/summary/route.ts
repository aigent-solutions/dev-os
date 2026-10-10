import { requireUser } from '@/lib/api/require-user';
import { withApiHandler } from '@/lib/api/with-api-handler';
import { getDashboardSummary } from '@/server/services/dashboard.service';

export const runtime = 'nodejs';

/** GET /api/dashboard/summary — totals by type, reviewed count and the 5 most recent contracts (10 §5.1). */
export const GET = withApiHandler(async () => {
  const { supabase } = await requireUser();
  return Response.json(await getDashboardSummary(supabase));
});
