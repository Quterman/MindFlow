revoke all on table public.mindflow_entries from authenticated;

grant select, insert, update, delete
  on table public.mindflow_entries
  to authenticated;
