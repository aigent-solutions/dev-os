import './env';
import { seedUsers } from './seed-users';

/** Runs once before the integration project: checks the local stack is up, then seeds users. */
export default async function setup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
  }).catch(() => null);
  if (!res?.ok) {
    throw new Error(
      `Local Supabase is not reachable at ${url}. Run \`npm run db:start\` and export API_URL, ANON_KEY and ` +
        'SERVICE_ROLE_KEY from `supabase status -o env`.',
    );
  }
  await seedUsers();
}
