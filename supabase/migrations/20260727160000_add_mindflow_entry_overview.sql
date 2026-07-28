begin;

alter table public.mindflow_entries
  add column overview jsonb;

alter table public.mindflow_entries
  add constraint mindflow_entries_overview_is_object
  check (overview is null or jsonb_typeof(overview) = 'object');

comment on column public.mindflow_entries.overview is
  'Dedicated AI interpretation for the MindFlow overview screen.';

commit;
