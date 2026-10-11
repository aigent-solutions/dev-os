-- =============================================================================
-- ContractIQ — RLS enforcement and verification (Stage 7, docs/security/security-plan.md §3)
--
-- Paste-and-run in the Supabase SQL Editor AFTER the migrations in supabase/migrations/ (in filename order).
-- Idempotent and read-mostly: it (1) makes sure row level security is on for every app table and (2) returns
-- one row per problem. An empty result from step 2 means the database matches the security plan.
--
-- The policies themselves live in the migrations (single source of truth) — this script does not redefine
-- them, so it can't drift from what CI tests. CI runs the same checks: scripts/sql/verify-rls.sql.
-- =============================================================================

-- 1. RLS on for every app table (a no-op when it already is).
alter table public.profiles          enable row level security;
alter table public.contracts         enable row level security;
alter table public.custom_key_terms  enable row level security;
alter table public.key_terms         enable row level security;
alter table public.chat_sessions     enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.user_feedback     enable row level security;
alter table public.ai_usage_logs     enable row level security;
alter table public.rate_limits       enable row level security;
alter table public.audit_events      enable row level security;

-- 2. Verification: every row returned is a problem to fix.
--    missing_rls_or_policy  a public table without RLS, or with RLS but no policy at all
--    server_only_grant      anon/authenticated still hold a privilege on a server-only table
--    public_bucket          the contracts bucket is public (it must be private; files are served by signed URL)
--    missing_table          an expected app table doesn't exist (a migration wasn't run)
select 'missing_rls_or_policy' as check, c.relname as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (not c.relrowsecurity
       or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))
union all
select 'server_only_grant', table_name || ':' || grantee || ':' || privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('rate_limits', 'ai_usage_logs', 'audit_events')
  and grantee in ('anon', 'authenticated')
union all
select 'public_bucket', id
from storage.buckets
where id = 'contracts' and public
union all
select 'missing_table', t
from unnest(array['profiles', 'contracts', 'custom_key_terms', 'key_terms', 'chat_sessions', 'chat_messages',
                  'user_feedback', 'ai_usage_logs', 'rate_limits', 'audit_events']) as t
where to_regclass('public.' || t) is null;
