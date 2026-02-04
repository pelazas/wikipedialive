-- Add quality_score column (if not already added)
alter table public.edits
  add column if not exists quality_score integer;

create index if not exists edits_quality_score_idx on public.edits (quality_score);
