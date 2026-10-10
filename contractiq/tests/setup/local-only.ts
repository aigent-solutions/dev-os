/**
 * Integration and E2E setup seeds users and empties app tables with the service role. Refuse to do that
 * anywhere but a local Supabase stack, so a stray env var can never point the tests at a hosted project.
 */
export function assertLocalSupabase(url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): void {
  let host = '';
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    // fall through with an empty host
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `Refusing to run: tests write to Supabase with the service role and only run against a local stack, ` +
        `but NEXT_PUBLIC_SUPABASE_URL is "${url}". Start one with \`npm run db:start\` and export its values.`,
    );
  }
}
