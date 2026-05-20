# Stackd Content Engine

A fully automated AI video & content pipeline with a central command-center dashboard.

```
stackd-content-engine/
├─ dashboard/   → Next.js 15 command center (Stage 1 — built)
├─ pipeline/    → Node.js automation engine + Supabase schema (Stage 2)
│  └─ supabase/schema.sql
├─ remotion/    → Remotion video compositions / templates (Stage 3)
├─ output/      → rendered videos, audio, thumbnails, logs
└─ shared/      → shared TypeScript types & constants (used by all)
```

## Stage 1 — Dashboard (this build)

A dark, navy/gold command center with 9 pages:
**Overview · Content Calendar · Videos · Posts · Leads & CRM · Comments · Email List · Analytics · Pipeline Settings**, plus a floating gold **Run Pipeline** button (with a live stage-by-stage progress tracker) on every page.

### Run it

```bash
cd dashboard
npm install          # already run
npm run dev          # http://localhost:3030
```

The dashboard **runs with zero configuration** — when Supabase isn't connected it
serves rich placeholder data so every page, filter, chart, drag-and-drop board, and
approval queue is fully explorable. The sidebar footer shows the current mode
(`Demo · placeholder data` vs `Live · Supabase connected`).

### Connect Supabase (go live)

1. Create a Supabase project.
2. Run `pipeline/supabase/schema.sql` in the SQL editor (creates all 8 tables, enums,
   indexes, and enables Realtime on the tables the dashboard subscribes to).
3. Copy `dashboard/.env.local.example` → `dashboard/.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (optional) `ANTHROPIC_API_KEY` — powers the calendar plan generator, newsletter
     drafter, and weekly analytics insight via `/api/ai`.
   - (optional) `PIPELINE_WEBHOOK_URL` — where `/api/run-pipeline` forwards run requests.

Once env vars are present, `useTable` automatically switches from placeholders to live
Supabase queries **plus real-time subscriptions** — rows update on the screen as the
pipeline writes to the database. No page code changes.

## Architecture notes

- **Single data hook.** Every page reads through `lib/useTable.ts`. It transparently
  returns placeholder data (no Supabase) or live data + realtime (Supabase configured).
  Pages never branch on which mode they're in.
- **Hydration-safe demo data.** `lib/placeholder.ts` derives all timestamps from a fixed
  `NOW` constant (never `Date.now()`), so server-render and client-hydration match.
- **Shared types.** `/shared/types.ts` mirrors the SQL schema and is imported by the
  dashboard (`@shared/*`) and intended for the pipeline scripts too.
- **AI endpoints** (`/api/ai`) and the **pipeline trigger** (`/api/run-pipeline`) both
  call out when keys/URLs are set and fall back to deterministic stubs otherwise, so the
  UI works end-to-end before the backend exists.

## Tech stack

Next.js 15 · React 18 · Tailwind CSS 3 · Supabase (DB + Realtime) · Recharts ·
Anthropic Claude · ElevenLabs · Remotion · Resend · Node.js

## Next stages (scaffolded, not yet built)

- **Stage 2 — `/pipeline`:** the Node automation engine (ideate → research → script →
  virality score → ElevenLabs voiceover → Remotion render → thumbnail → captions →
  schedule → multi-platform post → lead capture → analytics pull), writing each stage to
  `pipeline_runs.output_log` and the `videos.run_log`.
- **Stage 3 — `/remotion`:** the video composition templates (short / medium / long).
