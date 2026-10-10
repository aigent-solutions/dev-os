-- 00-foundation.md §4.2 — both queries must return 0 rows.
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
  and table_name in ('rate_limits', 'ai_usage_logs')
  and grantee in ('anon', 'authenticated');
