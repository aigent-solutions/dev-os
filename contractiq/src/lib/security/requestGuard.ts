import 'server-only';
import { appError } from '@/lib/api/errors';
import { serverEnv } from '@/lib/env';
import type { Logger } from '@/lib/logger';

// CSRF defence in depth (docs/security/security-plan.md §5). The first layer is the auth cookie's
// SameSite=Lax, which browsers don't send on cross-site POSTs. This second layer doesn't depend on cookie
// behaviour: a browser write (POST/PUT/PATCH/DELETE) must come from this site's own pages, and a JSON body
// must be sent as JSON (parse.ts) — a cross-site <form> can only send form or text/plain bodies.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Hosts this request may legitimately come from: the Host it arrived with (and X-Forwarded-Host), the request
 * URL's host and the configured SITE_URL's. On Netlify `req.url` doesn't carry the hostname the browser used
 * (e.g. the main--<site>.netlify.app branch address), so the Host headers are what identify it.
 */
function ownHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (h: string | null | undefined) => {
    const v = h?.split(',')[0]?.trim().toLowerCase();
    if (v) hosts.add(v);
  };
  add(req.headers.get('host'));
  add(req.headers.get('x-forwarded-host'));
  add(new URL(req.url).host);
  try {
    add(new URL(serverEnv.SITE_URL).host);
  } catch {
    // SITE_URL is validated at boot; nothing else to allow if it can't be parsed here.
  }
  return hosts;
}

function isOwnOrigin(origin: string, req: Request): boolean {
  if (origin === 'null') return false; // sandboxed iframes, file:// pages
  try {
    return ownHosts(req).has(new URL(origin).host.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Throws 403 FORBIDDEN for a write request that a browser marks as coming from another site.
 *
 * - `Sec-Fetch-Site` present (every current browser): it alone decides — `same-origin`, or `none` for a
 *   user-typed navigation, passes; `same-site` and `cross-site` don't. The browser sets it and page scripts
 *   can't, so it stays correct behind proxies that rewrite the request URL.
 * - Absent (older browsers): `Origin`, when sent, must be one of this deployment's hosts (`ownHosts`).
 * - Neither header (server-to-server calls, tests): passes — such requests carry no ambient browser cookies.
 */
export function assertSameOriginWrite(req: Request, log?: Logger): void {
  if (!WRITE_METHODS.has(req.method.toUpperCase())) return;
  const fetchSite = req.headers.get('sec-fetch-site');
  const origin = req.headers.get('origin');
  const blocked =
    fetchSite !== null ? fetchSite !== 'same-origin' && fetchSite !== 'none' : origin !== null && !isOwnOrigin(origin, req);
  if (blocked) {
    log?.warn('request_blocked_cross_site', { origin, sec_fetch_site: fetchSite, host: req.headers.get('host') });
    throw appError('FORBIDDEN');
  }
}

/** True when the request declares a JSON body (`application/json`, any parameters such as charset). */
export function isJsonContentType(req: Request): boolean {
  const type = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  return type === 'application/json';
}
