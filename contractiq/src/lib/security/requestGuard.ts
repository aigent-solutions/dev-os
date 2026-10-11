import 'server-only';
import { appError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import type { Logger } from '@/lib/logger';

// CSRF defence in depth (docs/security/security-plan.md §5). The first layer is the auth cookie's
// SameSite=Lax, which browsers don't send on cross-site POSTs. This second layer doesn't depend on cookie
// behaviour: a browser write (POST/PUT/PATCH/DELETE) must come from this site's own pages, and a JSON body
// must be sent as JSON (parse.ts) — a cross-site <form> can only send form or text/plain bodies.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** This deployment's origins: the URL the request arrived on, and the configured site URL. */
function allowedOrigins(req: Request): Set<string> {
  const origins = new Set([new URL(req.url).origin]);
  try {
    origins.add(new URL(serverEnv.SITE_URL).origin);
  } catch {
    // SITE_URL is validated at boot; nothing else to allow if it can't be parsed here.
  }
  return origins;
}

/**
 * Throws 403 FORBIDDEN for a write request that a browser marks as coming from another site:
 * `Sec-Fetch-Site` other than same-origin (or none, a user-typed navigation), or an `Origin` header that isn't
 * this site (including the opaque "null" origin of sandboxed frames and file:// pages). Requests without
 * either header — server-to-server calls and tests — pass; they carry no ambient browser cookies.
 */
export function assertSameOriginWrite(req: Request, log?: Logger): void {
  if (!WRITE_METHODS.has(req.method.toUpperCase())) return;
  const fetchSite = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const crossSiteFetch = fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none';
  const foreignOrigin = origin !== null && (origin === 'null' || !allowedOrigins(req).has(origin));
  if (crossSiteFetch || foreignOrigin) {
    log?.warn('request_blocked_cross_site', { origin, sec_fetch_site: fetchSite });
    throw appError('FORBIDDEN');
  }
}

/** True when the request declares a JSON body (`application/json`, any parameters such as charset). */
export function isJsonContentType(req: Request): boolean {
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  return type === 'application/json';
}
