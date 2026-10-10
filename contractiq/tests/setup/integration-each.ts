import { beforeAll } from 'vitest';
import { resetAppTables } from '../helpers/supabase';

// Each integration test file starts from empty app tables (seed users are kept).
beforeAll(async () => {
  await resetAppTables();
});
