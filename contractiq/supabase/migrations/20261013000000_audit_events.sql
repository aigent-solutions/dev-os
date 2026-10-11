-- =============================================================================
-- ContractIQ — durable audit trail (Stage 7 security, docs/security/security-plan.md §6)
-- Function logs on Netlify are short-lived; security-relevant account and data events are kept here.
-- Idempotent: safe to run again in the Supabase SQL Editor. Run after 20261012000000_initial_schema.sql.
-- =============================================================================

-- SERVER ONLY, append-only. Rows are written by the service role (src/lib/security/auditLog.ts) and removed
-- only by the retention job after 365 days (AUDIT_RETENTION_DAYS).
create table if not exists public.audit_events (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  event          text        not null
    check (event in ('account.deleted', 'account.data_sharing_updated', 'contract.uploaded', 'contract.deleted')),
  -- No foreign key on purpose: the trail must outlive the account it describes (13 §6.4 erasure deletes the
  -- auth user). A pseudonymous id only — never an email, name, file name or contract content.
  actor_user_id  uuid,
  target_type    text check (target_type in ('account', 'contract')),
  target_id      uuid,
  request_id     text,
  metadata       jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

comment on table public.audit_events is
  'Security audit trail. Server only (service role); append-only; pruned after 365 days. No PII beyond user ids.';

create index if not exists audit_events_actor_idx    on public.audit_events (actor_user_id, occurred_at desc);
create index if not exists audit_events_occurred_idx on public.audit_events (occurred_at);

-- Append-only: an audit row is never edited, even by the service role. Deletes stay possible (retention).
create or replace function public.audit_events_block_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update
  before update on public.audit_events
  for each row execute function public.audit_events_block_update();

alter table public.audit_events enable row level security;

-- Same lock-down as rate_limits and ai_usage_logs (initial schema §6.9).
drop policy if exists "audit_events_deny_all" on public.audit_events;
create policy "audit_events_deny_all" on public.audit_events
  as restrictive
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.audit_events from anon, authenticated;
revoke all on function public.audit_events_block_update() from public, anon, authenticated;
