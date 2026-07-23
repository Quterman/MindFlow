begin;

create table public.mindflow_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    constraint mindflow_entries_user_id_fkey
    references auth.users (id)
    on delete cascade,
  entry_date date not null default current_date,
  raw_text text not null
    constraint mindflow_entries_raw_text_not_blank
    check (char_length(btrim(raw_text)) > 0),
  transcript text not null,
  summary text not null,
  themes jsonb not null default '[]'::jsonb
    constraint mindflow_entries_themes_is_array
    check (jsonb_typeof(themes) = 'array'),
  insights jsonb not null default '[]'::jsonb
    constraint mindflow_entries_insights_is_array
    check (jsonb_typeof(insights) = 'array'),
  todos jsonb not null default '[]'::jsonb
    constraint mindflow_entries_todos_is_array
    check (jsonb_typeof(todos) = 'array'),
  completed_todos jsonb not null default '[]'::jsonb
    constraint mindflow_entries_completed_todos_is_array
    check (jsonb_typeof(completed_todos) = 'array'),
  repeats jsonb not null default '[]'::jsonb
    constraint mindflow_entries_repeats_is_array
    check (jsonb_typeof(repeats) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mindflow_entries is
  'Private MindFlow reflection entries owned by Supabase Auth users.';

create index mindflow_entries_user_date_created_idx
  on public.mindflow_entries (user_id, entry_date desc, created_at desc);

alter table public.mindflow_entries enable row level security;

revoke all on table public.mindflow_entries from anon;
grant select, insert, update, delete
  on table public.mindflow_entries
  to authenticated;

create policy "mindflow_entries_select_own"
  on public.mindflow_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "mindflow_entries_insert_own"
  on public.mindflow_entries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "mindflow_entries_update_own"
  on public.mindflow_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "mindflow_entries_delete_own"
  on public.mindflow_entries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
