-- =============================================================================
-- ContractIQ — Supabase schema
-- Source of truth: docs/engineering/engineering-doc.md §7 (Database Design)
--
-- Paste the whole file into the Supabase SQL Editor and run it on a fresh project.
-- It is idempotent: re-running it on the same project is safe.
--
-- Contents (in order):
--   1. Extensions
--   2. Enumerated types
--   3. Shared trigger functions
--   4. Tables (dependency order) + indexes
--   5. Triggers
--   6. Row Level Security: enable + policies + privileges
--   7. RPC functions
--   8. Views
--   9. Storage bucket + storage.objects policies
--  10. Verification queries (commented out)
--
-- Client rules (see docs/specs/00-foundation.md §6):
--   * Route handlers use the user-scoped client (role `authenticated`) by default.
--   * The service-role client is used only for: contract server-managed columns
--     (/extract, /process, /status timeout), save_extraction_results, assistant
--     chat_messages, ai_usage_logs, check_rate_limit, retention, account deletion.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- -----------------------------------------------------------------------------
-- 2. Enumerated types (§7.2)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'contract_type' and typnamespace = 'public'::regnamespace) then
    create type public.contract_type as enum ('nda', 'msa');
  end if;
  if not exists (select 1 from pg_type where typname = 'detected_contract_type' and typnamespace = 'public'::regnamespace) then
    create type public.detected_contract_type as enum ('nda', 'msa', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'contract_status' and typnamespace = 'public'::regnamespace) then
    create type public.contract_status as enum ('pending_upload', 'ready', 'processing', 'completed', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'processing_stage' and typnamespace = 'public'::regnamespace) then
    create type public.processing_stage as enum ('analysing', 'compiling');
  end if;
  if not exists (select 1 from pg_type where typname = 'chat_role' and typnamespace = 'public'::regnamespace) then
    create type public.chat_role as enum ('user', 'assistant');
  end if;
  if not exists (select 1 from pg_type where typname = 'chat_query_type' and typnamespace = 'public'::regnamespace) then
    create type public.chat_query_type as enum ('contract', 'history', 'both');
  end if;
  if not exists (select 1 from pg_type where typname = 'message_status' and typnamespace = 'public'::regnamespace) then
    create type public.message_status as enum ('complete', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'feedback_rating' and typnamespace = 'public'::regnamespace) then
    create type public.feedback_rating as enum ('up', 'down');
  end if;
  if not exists (select 1 from pg_type where typname = 'accuracy_rating' and typnamespace = 'public'::regnamespace) then
    create type public.accuracy_rating as enum ('yes', 'partially', 'no');
  end if;
  if not exists (select 1 from pg_type where typname = 'ai_operation' and typnamespace = 'public'::regnamespace) then
    create type public.ai_operation as enum ('extraction', 'extraction_repair', 'chat');
  end if;
  if not exists (select 1 from pg_type where typname = 'plan_tier' and typnamespace = 'public'::regnamespace) then
    create type public.plan_tier as enum ('trial', 'starter', 'growth', 'pro');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- 3. Shared trigger functions
-- -----------------------------------------------------------------------------

-- Keeps updated_at current on every table that has the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Tables + indexes (§7.3 – §7.11)
-- -----------------------------------------------------------------------------

-- 4.1 profiles (§7.3) -----------------------------------------------------------
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  email                    text not null,
  full_name                text,
  plan                     public.plan_tier not null default 'trial',
  trial_ends_at            timestamptz default (now() + interval '14 days'),
  feedback_opt_in          boolean not null default false,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 120)
);

-- 4.2 contracts (§7.4) ----------------------------------------------------------
create table if not exists public.contracts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  file_name                text not null,
  file_path                text,
  file_size_bytes          integer not null,
  contract_type            public.contract_type not null,
  detected_contract_type   public.detected_contract_type,
  type_mismatch            boolean not null default false,
  status                   public.contract_status not null default 'pending_upload',
  processing_stage         public.processing_stage,
  contract_text            text,
  page_count               smallint,
  word_count               integer,
  token_count              integer,
  processing_attempts      smallint not null default 0,
  processing_started_at    timestamptz,
  processing_completed_at  timestamptz,
  error_code               text,
  error_message            text,
  prompt_version           text,
  review_completed_at      timestamptz,
  last_accessed_at         timestamptz not null default now(),
  file_deleted_at          timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint contracts_file_name_length   check (char_length(file_name) between 1 and 255),
  constraint contracts_file_size_range    check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  constraint contracts_page_count_range   check (page_count between 1 and 20),
  constraint contracts_word_count_min     check (word_count >= 100),
  constraint contracts_token_count_max    check (token_count <= 15000),
  constraint contracts_text_required      check (status not in ('ready', 'processing', 'completed') or contract_text is not null)
);

create index if not exists idx_contracts_user_created on public.contracts (user_id, created_at desc);
create index if not exists idx_contracts_user_type    on public.contracts (user_id, contract_type);
create index if not exists idx_contracts_retention    on public.contracts (last_accessed_at) where file_path is not null;
create index if not exists idx_contracts_pending      on public.contracts (created_at) where status = 'pending_upload';

-- 4.3 custom_key_terms (§7.5) ---------------------------------------------------
create table if not exists public.custom_key_terms (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  term_name    text not null,
  is_manual    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint custom_key_terms_term_name_length check (char_length(term_name) between 2 and 60)
);

create unique index if not exists uq_custom_terms_contract_name on public.custom_key_terms (contract_id, lower(term_name));
create index if not exists idx_custom_terms_contract on public.custom_key_terms (contract_id);

-- 4.4 key_terms (§7.6) ----------------------------------------------------------
create table if not exists public.key_terms (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           uuid not null references public.contracts (id) on delete cascade,
  user_id               uuid not null references auth.users (id) on delete cascade,
  custom_key_term_id    uuid references public.custom_key_terms (id) on delete set null,
  term_key              text not null,
  term_name             text not null,
  is_custom             boolean not null default false,
  value                 text,
  page_number           smallint,
  confidence_score      smallint not null,
  source_sentence       text,
  source_verified       boolean not null default false,
  display_order         smallint not null,
  is_edited             boolean not null default false,
  original_value        text,
  original_page_number  smallint,
  edited_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint key_terms_page_number_min      check (page_number >= 1),
  constraint key_terms_confidence_range     check (confidence_score between 0 and 100),
  constraint key_terms_contract_term_unique unique (contract_id, term_key)
);

create index if not exists idx_key_terms_contract_order on public.key_terms (contract_id, display_order);
create index if not exists idx_key_terms_edited         on public.key_terms (edited_at) where is_edited;

-- 4.5 chat_sessions (§7.7) ------------------------------------------------------
create table if not exists public.chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null unique references public.contracts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user on public.chat_sessions (user_id);

-- 4.6 chat_messages (§7.8) ------------------------------------------------------
create table if not exists public.chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.chat_sessions (id) on delete cascade,
  contract_id        uuid not null references public.contracts (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  role               public.chat_role not null,
  content            text not null,
  query_type         public.chat_query_type,
  cited_pages        smallint[] not null default '{}',
  is_not_found       boolean not null default false,
  citation_missing   boolean not null default false,
  status             public.message_status not null default 'complete',
  prompt_tokens      integer,
  completion_tokens  integer,
  created_at         timestamptz not null default now(),
  constraint chat_messages_content_length check (char_length(content) between 1 and 8000)
);

create index if not exists idx_chat_messages_session_created on public.chat_messages (session_id, created_at);

-- 4.7 user_feedback (§7.9) ------------------------------------------------------
create table if not exists public.user_feedback (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  contract_id      uuid not null references public.contracts (id) on delete cascade,
  rating           public.feedback_rating not null,
  comment          text,
  accuracy_rating  public.accuracy_rating,
  nps_score        smallint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint user_feedback_comment_length    check (char_length(comment) <= 1000),
  constraint user_feedback_nps_range         check (nps_score between 0 and 10),
  constraint user_feedback_user_contract_key unique (user_id, contract_id)
);

-- 4.8 ai_usage_logs (§7.10) — SERVER ONLY ---------------------------------------
create table if not exists public.ai_usage_logs (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  contract_id        uuid references public.contracts (id) on delete set null,
  operation          public.ai_operation not null,
  model              text not null,
  prompt_version     text not null,
  prompt_tokens      integer not null default 0,
  completion_tokens  integer not null default 0,
  cost_usd           numeric(10, 6) not null default 0,
  latency_ms         integer not null,
  attempts           smallint not null default 1,
  success            boolean not null,
  error_code         text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_created      on public.ai_usage_logs (user_id, created_at desc);
create index if not exists idx_ai_usage_operation_created on public.ai_usage_logs (operation, created_at desc);

-- 4.9 rate_limits (§7.11) — SERVER ONLY -----------------------------------------
create table if not exists public.rate_limits (
  user_id       uuid not null references auth.users (id) on delete cascade,
  bucket        text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (user_id, bucket, window_start)
);


-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------

-- 5.1 updated_at on every table that has the column
drop trigger if exists trg_profiles_updated_at      on public.profiles;
create trigger trg_profiles_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();

drop trigger if exists trg_contracts_updated_at     on public.contracts;
create trigger trg_contracts_updated_at     before update on public.contracts     for each row execute function public.set_updated_at();

drop trigger if exists trg_key_terms_updated_at     on public.key_terms;
create trigger trg_key_terms_updated_at     before update on public.key_terms     for each row execute function public.set_updated_at();

drop trigger if exists trg_chat_sessions_updated_at on public.chat_sessions;
create trigger trg_chat_sessions_updated_at before update on public.chat_sessions for each row execute function public.set_updated_at();

drop trigger if exists trg_user_feedback_updated_at on public.user_feedback;
create trigger trg_user_feedback_updated_at before update on public.user_feedback for each row execute function public.set_updated_at();

-- 5.2 profiles: create a profile row for every new auth user (§7.3)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.3 contracts: server-managed columns cannot be written by end users (§7.4)
--
-- Fires for the `authenticated` and `anon` roles only. The service role and
-- SECURITY DEFINER functions (current_user = owner) pass through.
--
-- UPDATE: blocks changes to the columns listed in §7.4 (status, contract_text,
--   page_count, token_count, word_count, detected_contract_type, processing_*,
--   error_*, prompt_version) plus type_mismatch, file_path, file_deleted_at,
--   file_size_bytes and contract_type, which are also server-managed. file_path
--   is guarded so a user can't point their row at another user's object before
--   a service-role Storage call.
-- INSERT: a new row must start as an empty `pending_upload` record, and
--   file_path must sit under '{user_id}/{id}/'.
create or replace function public.guard_contract_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending_upload'
       or new.contract_text is not null
       or new.page_count is not null
       or new.word_count is not null
       or new.token_count is not null
       or new.detected_contract_type is not null
       or new.type_mismatch
       or new.processing_stage is not null
       or new.processing_attempts <> 0
       or new.processing_started_at is not null
       or new.processing_completed_at is not null
       or new.error_code is not null
       or new.error_message is not null
       or new.prompt_version is not null
       or new.review_completed_at is not null
       or new.file_deleted_at is not null then
      raise exception 'contracts: server-managed columns cannot be set on insert'
        using errcode = '42501';
    end if;
    if new.file_path is not null
       and new.file_path not like (new.user_id::text || '/' || new.id::text || '/%') then
      raise exception 'contracts: file_path must be under {user_id}/{contract_id}/'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status                  is distinct from old.status
     or new.contract_text           is distinct from old.contract_text
     or new.page_count              is distinct from old.page_count
     or new.token_count             is distinct from old.token_count
     or new.word_count              is distinct from old.word_count
     or new.detected_contract_type  is distinct from old.detected_contract_type
     or new.type_mismatch           is distinct from old.type_mismatch
     or new.processing_stage        is distinct from old.processing_stage
     or new.processing_attempts     is distinct from old.processing_attempts
     or new.processing_started_at   is distinct from old.processing_started_at
     or new.processing_completed_at is distinct from old.processing_completed_at
     or new.error_code              is distinct from old.error_code
     or new.error_message           is distinct from old.error_message
     or new.prompt_version          is distinct from old.prompt_version
     or new.file_path               is distinct from old.file_path
     or new.file_deleted_at         is distinct from old.file_deleted_at
     or new.file_size_bytes         is distinct from old.file_size_bytes
     or new.contract_type           is distinct from old.contract_type then
    raise exception 'contracts: attempted to modify a server-managed column'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contracts_guard_columns on public.contracts;
create trigger trg_contracts_guard_columns
  before insert or update on public.contracts
  for each row execute function public.guard_contract_columns();

-- 5.4 custom_key_terms: max 5 per contract (§7.5)
create or replace function public.enforce_custom_term_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Serialise concurrent inserts for the same contract.
  perform 1 from public.contracts where id = new.contract_id for update;

  select count(*) into v_count
  from public.custom_key_terms
  where contract_id = new.contract_id;

  if v_count >= 5 then
    raise exception 'custom_key_terms: a contract can have at most 5 custom terms'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_custom_terms_limit on public.custom_key_terms;
create trigger trg_custom_terms_limit
  before insert on public.custom_key_terms
  for each row execute function public.enforce_custom_term_limit();

-- 5.5 key_terms: keep the first AI value when a user edits (§7.6)
create or replace function public.preserve_original_term_value()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.value is distinct from old.value
     or new.page_number is distinct from old.page_number then
    if old.original_value is null and not old.is_edited then
      new.original_value       := old.value;
      new.original_page_number := old.page_number;
    end if;
    new.is_edited := true;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_key_terms_preserve_original on public.key_terms;
create trigger trg_key_terms_preserve_original
  before update on public.key_terms
  for each row execute function public.preserve_original_term_value();

-- 5.6 chat_sessions.updated_at is bumped on every new message (§7.7)
-- SECURITY DEFINER because `authenticated` has no UPDATE policy on chat_sessions.
create or replace function public.touch_chat_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_sessions
  set updated_at = now()
  where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_touch_session on public.chat_messages;
create trigger trg_chat_messages_touch_session
  after insert on public.chat_messages
  for each row execute function public.touch_chat_session();

-- Trigger functions are not callable directly by API roles.
revoke execute on function public.handle_new_user()             from public, anon, authenticated;
revoke execute on function public.enforce_custom_term_limit()   from public, anon, authenticated;
revoke execute on function public.touch_chat_session()          from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. Row Level Security (§7) — enabled on every table, ≥ 1 policy per table
--    Policy naming: "<table>_<op>_own"
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.contracts         enable row level security;
alter table public.custom_key_terms  enable row level security;
alter table public.key_terms         enable row level security;
alter table public.chat_sessions     enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.user_feedback     enable row level security;
alter table public.ai_usage_logs     enable row level security;
alter table public.rate_limits       enable row level security;

-- 6.1 profiles (§7.3): SELECT + UPDATE own. No INSERT/DELETE for users.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users cannot change plan / trial_ends_at (§7.3).
-- In Postgres a column-level REVOKE has no effect while a table-level UPDATE
-- grant exists, so the table grant is revoked and only the user-editable
-- columns are re-granted. `plan`, `trial_ends_at`, `email`, `id` and the
-- timestamps cannot be updated by `authenticated`.
revoke update on public.profiles from authenticated;
grant  update (full_name, feedback_opt_in, onboarding_completed_at) on public.profiles to authenticated;

-- 6.2 contracts (§7.4): SELECT / INSERT / UPDATE / DELETE own.
-- Server-managed columns are protected by trg_contracts_guard_columns (§5.3).
drop policy if exists "contracts_select_own" on public.contracts;
create policy "contracts_select_own" on public.contracts
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "contracts_insert_own" on public.contracts;
create policy "contracts_insert_own" on public.contracts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "contracts_update_own" on public.contracts;
create policy "contracts_update_own" on public.contracts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "contracts_delete_own" on public.contracts;
create policy "contracts_delete_own" on public.contracts
  for delete to authenticated
  using (user_id = auth.uid());

-- 6.3 custom_key_terms (§7.5): owner-only, all operations.
-- Writes must also target a contract the user owns.
drop policy if exists "custom_key_terms_select_own" on public.custom_key_terms;
create policy "custom_key_terms_select_own" on public.custom_key_terms
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "custom_key_terms_insert_own" on public.custom_key_terms;
create policy "custom_key_terms_insert_own" on public.custom_key_terms
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.contracts c where c.id = contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_update_own" on public.custom_key_terms;
create policy "custom_key_terms_update_own" on public.custom_key_terms
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.contracts c where c.id = contract_id and c.user_id = auth.uid())
  );

drop policy if exists "custom_key_terms_delete_own" on public.custom_key_terms;
create policy "custom_key_terms_delete_own" on public.custom_key_terms
  for delete to authenticated
  using (user_id = auth.uid());

-- 6.4 key_terms (§7.6): SELECT own; UPDATE own on (value, page_number) only.
-- INSERT/DELETE: service role (save_extraction_results) or cascade — no user policy.
drop policy if exists "key_terms_select_own" on public.key_terms;
create policy "key_terms_select_own" on public.key_terms
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "key_terms_update_own" on public.key_terms;
create policy "key_terms_update_own" on public.key_terms
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on public.key_terms from authenticated;
grant  update (value, page_number) on public.key_terms to authenticated;

-- 6.5 chat_sessions (§7.7): SELECT + INSERT own; INSERT only for an owned contract.
drop policy if exists "chat_sessions_select_own" on public.chat_sessions;
create policy "chat_sessions_select_own" on public.chat_sessions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chat_sessions_insert_own" on public.chat_sessions;
create policy "chat_sessions_insert_own" on public.chat_sessions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.contracts c where c.id = contract_id and c.user_id = auth.uid())
  );

-- 6.6 chat_messages (§7.8): SELECT own; INSERT own USER messages only.
-- Assistant messages are server-only (service-role client). No UPDATE/DELETE.
drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'user'
    and status = 'complete'
    and cited_pages = '{}'
    and is_not_found = false
    and citation_missing = false
    and prompt_tokens is null
    and completion_tokens is null
    and exists (
      select 1 from public.chat_sessions s
      where s.id = session_id
        and s.user_id = auth.uid()
        and s.contract_id = chat_messages.contract_id
    )
  );

-- 6.7 user_feedback (§7.9): owner-only SELECT, INSERT, UPDATE.
drop policy if exists "user_feedback_select_own" on public.user_feedback;
create policy "user_feedback_select_own" on public.user_feedback
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_feedback_insert_own" on public.user_feedback;
create policy "user_feedback_insert_own" on public.user_feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.contracts c where c.id = contract_id and c.user_id = auth.uid())
  );

drop policy if exists "user_feedback_update_own" on public.user_feedback;
create policy "user_feedback_update_own" on public.user_feedback
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 6.8 ai_usage_logs (§7.10): SERVER ONLY.
drop policy if exists "ai_usage_logs_deny_all" on public.ai_usage_logs;
create policy "ai_usage_logs_deny_all" on public.ai_usage_logs
  as restrictive
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.ai_usage_logs from anon, authenticated;

-- 6.9 rate_limits (§7.11): SERVER ONLY.
drop policy if exists "rate_limits_deny_all" on public.rate_limits;
create policy "rate_limits_deny_all" on public.rate_limits
  as restrictive
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on public.rate_limits from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 7. RPC functions (§7.11, §7.12)
-- -----------------------------------------------------------------------------

-- 7.1 check_rate_limit — fixed-window counter. Service role only.
create or replace function public.check_rate_limit(
  p_user_id         uuid,
  p_bucket          text,
  p_limit           integer,
  p_window_seconds  integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'check_rate_limit: p_limit and p_window_seconds must be >= 1';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (user_id, bucket, window_start, count)
  values (p_user_id, p_bucket, v_window_start, 1)
  on conflict (user_id, bucket, window_start)
  do update set count = rl.count + 1
  returning rl.count into v_count;

  allowed   := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  reset_at  := v_window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

-- 7.2 save_extraction_results — transactional write of extraction output.
-- Service role only. p_terms is a JSON array of objects with keys:
--   term_key, term_name, is_custom, custom_key_term_id (uuid|null), value (text|null),
--   page_number (int|null), confidence_score (0-100), source_sentence (text|null),
--   source_verified (bool), display_order (int)
create or replace function public.save_extraction_results(
  p_contract_id     uuid,
  p_user_id         uuid,
  p_detected_type   text,
  p_type_mismatch   boolean,
  p_prompt_version  text,
  p_terms           jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_terms) is distinct from 'array' then
    raise exception 'save_extraction_results: p_terms must be a JSON array' using errcode = '22023';
  end if;

  perform 1
  from public.contracts
  where id = p_contract_id
    and user_id = p_user_id
    and status = 'processing'
  for update;

  if not found then
    raise exception 'save_extraction_results: contract % is not processing for this user', p_contract_id
      using errcode = 'P0002';
  end if;

  delete from public.key_terms where contract_id = p_contract_id;

  insert into public.key_terms (
    contract_id, user_id, custom_key_term_id, term_key, term_name, is_custom,
    value, page_number, confidence_score, source_sentence, source_verified, display_order
  )
  select
    p_contract_id,
    p_user_id,
    nullif(t ->> 'custom_key_term_id', '')::uuid,
    t ->> 'term_key',
    t ->> 'term_name',
    coalesce((t ->> 'is_custom')::boolean, false),
    t ->> 'value',
    (t ->> 'page_number')::smallint,
    (t ->> 'confidence_score')::smallint,
    t ->> 'source_sentence',
    coalesce((t ->> 'source_verified')::boolean, false),
    (t ->> 'display_order')::smallint
  from jsonb_array_elements(p_terms) as t;

  update public.contracts
  set status                  = 'completed',
      processing_stage        = null,
      processing_completed_at = now(),
      detected_contract_type  = p_detected_type::public.detected_contract_type,
      type_mismatch           = p_type_mismatch,
      prompt_version          = p_prompt_version,
      error_code              = null,
      error_message           = null
  where id = p_contract_id;
end;
$$;

revoke execute on function public.save_extraction_results(uuid, uuid, text, boolean, text, jsonb) from public, anon, authenticated;
grant  execute on function public.save_extraction_results(uuid, uuid, text, boolean, text, jsonb) to service_role;

-- 7.3 get_dashboard_summary — SECURITY INVOKER, so RLS scopes it to auth.uid().
create or replace function public.get_dashboard_summary()
returns table (
  total            bigint,
  nda_count        bigint,
  msa_count        bigint,
  completed_count  bigint,
  reviewed_count   bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)                                                   as total,
    count(*) filter (where c.contract_type = 'nda')            as nda_count,
    count(*) filter (where c.contract_type = 'msa')            as msa_count,
    count(*) filter (where c.status = 'completed')             as completed_count,
    count(*) filter (where c.review_completed_at is not null)  as reviewed_count
  from public.contracts c
  where c.user_id = auth.uid()
    and c.status <> 'pending_upload';
$$;

revoke execute on function public.get_dashboard_summary() from public, anon;
grant  execute on function public.get_dashboard_summary() to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 8. Views (§7.12)
-- -----------------------------------------------------------------------------

-- 8.1 term_corrections — user-visible correction log (RLS applies via security_invoker).
create or replace view public.term_corrections
with (security_invoker = true)
as
select
  kt.id,
  kt.contract_id,
  kt.user_id,
  kt.term_key,
  kt.term_name,
  kt.is_custom,
  kt.original_value,
  kt.value as corrected_value,
  kt.original_page_number,
  kt.page_number,
  kt.confidence_score,
  kt.edited_at
from public.key_terms kt
where kt.is_edited;

revoke all    on public.term_corrections from anon;
grant  select on public.term_corrections to authenticated, service_role;

-- 8.2 term_corrections_anonymised — opt-in users only, identifiers removed. Service role only.
create or replace view public.term_corrections_anonymised
with (security_invoker = true)
as
select
  md5(tc.contract_id::text) as contract_hash,
  tc.term_key,
  tc.term_name,
  tc.is_custom,
  tc.original_value,
  tc.corrected_value,
  tc.original_page_number,
  tc.page_number,
  tc.confidence_score,
  tc.edited_at
from public.term_corrections tc
join public.profiles p on p.id = tc.user_id
where p.feedback_opt_in;

revoke all    on public.term_corrections_anonymised from anon, authenticated;
grant  select on public.term_corrections_anonymised to service_role;

-- 8.3 term_correction_rate_7d — rolling correction rate (alert above 0.12). Service role only.
create or replace view public.term_correction_rate_7d
with (security_invoker = true)
as
select
  count(*) filter (where kt.is_edited and kt.edited_at > now() - interval '7 days') as edited_terms_7d,
  count(*) filter (where kt.created_at > now() - interval '7 days')                as extracted_terms_7d,
  (count(*) filter (where kt.is_edited and kt.edited_at > now() - interval '7 days'))::numeric
    / nullif(count(*) filter (where kt.created_at > now() - interval '7 days'), 0) as correction_rate
from public.key_terms kt;

revoke all    on public.term_correction_rate_7d from anon, authenticated;
grant  select on public.term_correction_rate_7d to service_role;

-- 8.4 contract_analysis_costs — OpenAI cost per contract (target ≤ $0.25). Service role only.
create or replace view public.contract_analysis_costs
with (security_invoker = true)
as
select
  u.contract_id,
  sum(u.cost_usd)                                            as total_cost_usd,
  sum(u.cost_usd) filter (where u.operation <> 'chat')       as extraction_cost_usd,
  sum(u.cost_usd) filter (where u.operation = 'chat')        as chat_cost_usd,
  sum(u.prompt_tokens)                                       as prompt_tokens,
  sum(u.completion_tokens)                                   as completion_tokens,
  count(*)                                                   as call_count,
  min(u.created_at)                                          as first_call_at,
  max(u.created_at)                                          as last_call_at
from public.ai_usage_logs u
where u.contract_id is not null
group by u.contract_id;

revoke all    on public.contract_analysis_costs from anon, authenticated;
grant  select on public.contract_analysis_costs to service_role;


-- -----------------------------------------------------------------------------
-- 9. Storage (§7.13)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Object path: {user_id}/{contract_id}/{safe_file_name}.pdf
-- No UPDATE policy: objects cannot be overwritten.
drop policy if exists "contracts_objects_insert_own" on storage.objects;
create policy "contracts_objects_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "contracts_objects_select_own" on storage.objects;
create policy "contracts_objects_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "contracts_objects_delete_own" on storage.objects;
create policy "contracts_objects_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);


-- -----------------------------------------------------------------------------
-- 10. Verification (run manually; also used by the CI RLS check)
-- -----------------------------------------------------------------------------
-- Every public table has RLS enabled and at least one policy (expect 0 rows):
--
-- select c.relname
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
--   and (not c.relrowsecurity
--        or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname));
--
-- Server-only tables have no privileges for API roles (expect 0 rows):
--
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('rate_limits', 'ai_usage_logs')
--   and grantee in ('anon', 'authenticated');
