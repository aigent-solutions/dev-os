import type { Config } from '@netlify/functions';
import { logger } from '../../src/lib/logger';
import { runRetention } from '../../src/server/services/retention.service';

// Daily data lifecycle, 03:00 UTC (13 §6.6). Everything reachable from here must load in plain Node
// (server-guard, never server-only). Manual run: netlify functions:invoke retention-cleanup
export default async (req: Request) => {
  const { next_run } = (await req.json().catch(() => ({}))) as { next_run?: string };
  const summary = await runRetention(new Date());
  logger.info('retention_completed', { ...summary, next_run });
  return new Response(null, { status: 200 });
};

export const config: Config = { schedule: '0 3 * * *' };
