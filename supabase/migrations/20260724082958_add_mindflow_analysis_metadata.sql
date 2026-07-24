begin;

alter table public.mindflow_entries
  add column analysis_source text not null default 'legacy'
    constraint mindflow_entries_analysis_source_valid
    check (analysis_source in ('legacy', 'ai', 'fallback')),
  add column analysis_model text,
  add column analysis_version text,
  add column analysis_generated_at timestamptz;

comment on column public.mindflow_entries.analysis_source is
  'Origin of the saved analysis: AI, local fallback rules, or a legacy row.';

comment on column public.mindflow_entries.analysis_model is
  'OpenRouter model identifier used for the saved AI analysis.';

comment on column public.mindflow_entries.analysis_version is
  'Version of the AI prompt/schema or fallback rules used for the analysis.';

comment on column public.mindflow_entries.analysis_generated_at is
  'Time when the saved analysis was generated.';

commit;
