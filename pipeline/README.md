# /pipeline — Automation Engine (Stage 2)

Node.js scripts that drive a topic through the full content pipeline and write
progress to Supabase as it goes.

- `supabase/schema.sql` — **run this first** in your Supabase SQL editor. Creates all
  8 tables (videos, posts, analytics, leads, comments, emails, content_calendar,
  pipeline_runs), their enums and indexes, and enables Realtime.

## Planned stages (see `shared/constants.ts → PIPELINE_STAGES`)

`ideate → research → script (Claude) → score_virality → voiceover (ElevenLabs) →
render (Remotion) → thumbnail → caption → schedule → post → capture_leads → pull_analytics`

The dashboard's `/api/run-pipeline` route forwards run requests here via
`PIPELINE_WEBHOOK_URL`. Each run should insert a `pipeline_runs` row and append to its
`output_log` per stage; finished videos land in `videos` with a populated `run_log`,
and posts/analytics flow into their tables — the dashboard updates live via Realtime.
