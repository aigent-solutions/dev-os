// A complete FAKE environment, set before any app module is imported. No real keys.
// Integration runs override the Supabase values with the local stack's (CI exports them from
// `supabase status -o env`; locally, export them before `npm run test:integration`).
const defaults: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-key-000000',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-a-real-key',
  OPENAI_API_KEY: 'sk-test-not-a-real-key',
  OPENAI_PRICE_INPUT_PER_MTOK: '2.5',
  OPENAI_PRICE_OUTPUT_PER_MTOK: '10',
  OPENAI_USER_HASH_SALT: 'test-salt-test-salt-test-salt-test-salt',
  OPENAI_MONTHLY_BUDGET_USD: '400',
  INTERNAL_FUNCTION_SECRET: 'test-internal-secret-test-internal-secret',
};

// Map the Supabase CLI's `status -o env` names onto the app's names when present.
const fromCli: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SERVICE_ROLE_KEY,
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ||= fromCli[key] || value;
}
