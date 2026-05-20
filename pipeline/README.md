# Stackd Content Engine — Pipeline

The automation engine. It drives a single topic through the entire content
lifecycle — **script → voiceover → media → thumbnail → render → virality gate →
multi-platform post → repurpose → engagement** — and writes every result to
Supabase so the [dashboard](../dashboard) updates in real time.

> **Runs with zero API keys.** Every integration calls the real provider when its
> key is present, and otherwise logs a warning and returns a well-formed **mock**
> so the whole pipeline runs end-to-end and still writes to Supabase. Add keys to
> flip each piece from demo → live, one at a time.

---

## 1. What this system does

| Stage | File | Does |
|---|---|---|
| 2 · Script + strategy | `src/stages/generateScript.js` | YouTube-trends + web-search grounding → Claude generates 3 hooks (6 styles), full script, shot list w/ timestamps + animation bullets, per-platform captions/hashtags, YouTube SEO, virality score + reasoning, recommended hook. Inserts the `videos` row. |
| 3 · Voiceover | `src/stages/generateVoice.js` | ElevenLabs TTS → `/output/audio/<id>.mp3` + word-level timestamps for caption sync. |
| 4 · Media | `src/stages/gatherMedia.js` | Checks `/output/media-library` first, else Pexels stock photo/video, downloads to `/output/media/<id>/`. Picks royalty-free music from settings. |
| 5 · Thumbnail | `src/stages/generateThumbnail.js` | DALL·E 3 → 3 options, Claude picks highest-CTR + why, Remotion branded frame as backup. |
| 6 · Render | `src/stages/renderVideo.js` | Remotion renders **3 versions** (landscape/vertical/square) with synced VO, burned-in word captions, b-roll, ducked music, branding, intro/outro bumpers. |
| 7 · Virality gate | `src/stages/viralityCheck.js` | If score ≥ threshold **and** auto-post on → continue. Else flag video + send approval notification (Slack/email) and pause. |
| 8 · Posting | `src/platforms/*.js` | One uploader per platform, run in parallel (`Promise.allSettled`); each writes a `posts` row. |
| 9 · Repurpose | `src/stages/repurpose.js` | Blog MDX, X thread, LinkedIn article, newsletter block, 3× FFmpeg highlight clips, 3× quote cards. |
| 10 · Engagement | `src/engagement/*.js` | Hourly comment monitor (sentiment + drafted replies + trigger detection) and DM lead-qualification handler. |
| 11 · Email | `src/email/*.js` | Lead capture + welcome, 4-step drip sequence, weekly newsletter draft → approval → Resend. |
| 12 · Analytics | `src/analytics/pullAnalytics.js` | Daily metrics pull per post + Claude weekly insight. |
| 13 · Calendar | `src/calendar/generateCalendar.js` | Claude generates a balanced N-day content plan into `content_calendar`. |
| — · Orchestrator | `src/index.js` | Runs stages in order, updates `pipeline_runs` live, handles the approval pause + failure alerts. |

---

## 2. Folder structure

```
pipeline/
├─ src/
│  ├─ index.js              # orchestrator (runPipeline)
│  ├─ server.js             # HTTP trigger: POST /run, POST /lead, GET /health
│  ├─ cron.js               # node-cron schedules (comments/email/analytics/newsletter)
│  ├─ lib/                  # shared clients & helpers (frozen API used by every stage)
│  │   ├─ ai.js  elevenlabs.js  pexels.js  openai.js  resend.js
│  │   ├─ supabase.js  runState.js  settings.js  notify.js
│  │   ├─ youtube.js  search.js  mediaLibrary.js
│  │   └─ paths.js  http.js  logger.js  env.js  constants.js
│  ├─ stages/               # stages 2–7, 9
│  ├─ platforms/            # 6 uploaders + index.js (postToPlatforms)
│  ├─ engagement/           # commentMonitor.js, dmHandler.js
│  ├─ email/                # leadCapture.js, emailSequence.js, weeklyNewsletter.js
│  ├─ analytics/            # pullAnalytics.js
│  └─ calendar/             # generateCalendar.js
├─ config/settings.json     # voice id, threshold, pillars, hook styles, triggers, music, brand…
├─ scripts/check.js         # `npm run check` → node --check every src file
├─ supabase/schema.sql      # the database (run this first)
└─ .env.example             # every key, all optional
```

Artifacts are written under the repo-level **`/output`** (`audio/`, `media/`,
`media-library/`, `thumbnails/`, `videos/`, `repurpose/`, `logs/`).

---

## 3. Setup

### Install
```bash
cd pipeline
npm install
cp .env.example .env     # fill in what you have; everything is optional
```

### Supabase + migrations
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql) — it
   creates all 8 tables, enums, indexes, the `videos.repurposed` column, and enables
   Realtime on the tables the dashboard subscribes to.
3. Put `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `pipeline/.env` (the engine uses
   the **service role** key for full server-side writes). The dashboard uses the anon key.

### Connect Remotion
The render stage dynamically loads Remotion, so the pipeline runs without it (writing
placeholder files) until you install it:
```bash
cd ../remotion
npm install            # pulls remotion + headless Chromium (~hundreds of MB)
npx remotion studio src/index.ts   # preview the landscape/vertical/square comps
```
`renderVideo.js` bundles `remotion/src/index.ts` and renders the three compositions to
`/output/videos/<id>/final-*.mp4`.

### FFmpeg (for repurpose clips)
Install FFmpeg and ensure `ffmpeg` is on your PATH. Without it, Stage 9 records the
intended clip paths and skips cutting (no crash).

---

## 4. Running it

### The dashboard
```bash
cd ../dashboard && npm run dev      # http://localhost:3030
```

### The pipeline — manually (CLI)
```bash
cd pipeline
node src/index.js "The 3-tool AI stack that runs my agency" --format short --pillar "AI Automation"
# flags: --format short|medium|long   --pillar "<name>"   --platforms youtube,tiktok   --autopost
```

Force full demo mode (mocks even if keys exist):
```bash
PIPELINE_DEMO=true node src/index.js "Any topic"
```

### The pipeline — via HTTP (so the dashboard's Run Pipeline button can trigger it)
```bash
npm run server         # listens on PORT (default 4040)
```
Then set `PIPELINE_WEBHOOK_URL=http://localhost:4040/run` in `dashboard/.env.local`.
Endpoints: `POST /run` (body `{topic,format,pillar,platforms,autoPost}`),
`POST /lead` (lead-magnet capture), `GET /health`.

### Run individual stages / jobs
```bash
npm run calendar          # generate a 30-day content plan
npm run comments          # one comment-monitor pass
npm run analytics         # one analytics pull + weekly insight
npm run newsletter        # draft this week's newsletter
node src/stages/generateScript.js "topic"   # any stage has a CLI entry
```

---

## 5. Cron jobs (engagement + analytics)

```bash
npm run cron      # keeps a process alive with node-cron
```
Schedules (America/New_York):
- **Hourly** → `runCommentMonitor()`
- **Daily 9am** → `runEmailSequence()` + `runAnalyticsPull()`
- **Sundays 8am** → `generateWeeklyNewsletter()` (saves a draft for dashboard approval)

**Serverless alternative:** instead of a long-running process, point an external scheduler
(cron-job.org, GitHub Actions, Vercel Cron) at small HTTP handlers, or invoke the npm
scripts above on a schedule. Each job is idempotent and safe to re-run.

---

## 6. Getting every API key

| Key | Where | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) | Script, repurpose, insights, calendar, comment replies. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys) → Voices for the ID | Voiceover + word timestamps. |
| `SUPABASE_*` | Supabase → Project Settings → API | URL, anon key, **service role** key. |
| `RESEND_API_KEY` | [resend.com/api-keys](https://resend.com/api-keys) | Verify your sending domain for `RESEND_FROM`. |
| `PEXELS_API_KEY` | [pexels.com/api](https://www.pexels.com/api/) | Free stock photo/video. |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | DALL·E 3 thumbnails. |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → enable *YouTube Data API v3* | Trends signal (read-only). |
| `SEARCH_API_KEY` | [Brave Search API](https://brave.com/search/api/) | "What's trending now" grounding. |
| `SLACK_WEBHOOK_URL` | [api.slack.com/messaging/webhooks](https://api.slack.com/messaging/webhooks) | Approval/failure alerts. |

### Platform posting (OAuth — see §7)
`YOUTUBE_CLIENT_ID/SECRET/REDIRECT_URI/REFRESH_TOKEN`, `TIKTOK_CLIENT_KEY/SECRET/ACCESS_TOKEN`,
`INSTAGRAM_ACCESS_TOKEN/ACCOUNT_ID`, `LINKEDIN_ACCESS_TOKEN/PERSON_ID`,
`TWITTER_API_KEY/SECRET/ACCESS_TOKEN/ACCESS_SECRET`, `FACEBOOK_PAGE_ID/PAGE_ACCESS_TOKEN`.

---

## 7. Platform setup guide

Each uploader implements the real API shape and posts for real once its tokens exist;
until then it writes a realistic `posts` row so the dashboard stays populated.

- **YouTube** — Google Cloud project → enable *YouTube Data API v3* → OAuth consent
  (scope `youtube.upload`) → run the consent flow once to get a **refresh token**.
  Uploads landscape, unlisted, sets thumbnail, adds chapters from the shot list,
  uploads captions, pins a UTM comment.
- **TikTok** — [developers.tiktok.com](https://developers.tiktok.com) app → *Content
  Posting API* → user access token. Posts vertical as **draft**.
- **Instagram** — Meta app + IG **Business** account linked to a Facebook Page → Graph
  API → `INSTAGRAM_ACCOUNT_ID` + long-lived token. Posts vertical Reel, scheduled +1h.
- **LinkedIn** — LinkedIn Developer app → `w_member_social` → access token +
  `LINKEDIN_PERSON_ID` (`urn:li:person:...`). Landscape, professional framing, 3–5 tags.
- **Facebook** — Page access token + `FACEBOOK_PAGE_ID`. Landscape, full description.
- **X / Twitter** — developer app with OAuth 1.0a (media upload). Square, ≤280 chars + UTM.

Set `autoPost` per platform in `config/settings.json` (off = route finished posts to the
dashboard approval queue instead of publishing).

---

## 8. Configuration (`config/settings.json`)

Voice ID + settings, virality threshold, enabled platforms, per-platform auto-post,
auto-respond toggle, content pillars, hook styles, trigger words, curated music tracks,
brand voice/colors/CTA, lead magnet, notification channel, calendar link. Hot values
(`ELEVENLABS_VOICE_ID`, `VIRALITY_THRESHOLD`) can be overridden via `.env`.

---

## 9. Adding your own media library

Drop assets into **`/output/media-library/`** (`.mp4/.mov/.webm/.jpg/.png/.webp`, and a
`music/` subfolder for tracks). The gather stage matches files by filename keywords
against each shot's b-roll query **before** hitting Pexels, so your own footage wins.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Supabase not configured — DB writes skipped` | Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `pipeline/.env`. |
| Everything logs `◌ demo … (no key — using mock)` | That key isn't set — expected. Add the key to go live. |
| Render produces empty `.mp4` files | Remotion not installed — `cd remotion && npm install`. |
| Repurpose clips not created | FFmpeg not on PATH — install it. |
| Video stuck at `flagged` | Virality score below threshold or auto-post off → approve it in the dashboard, or lower `VIRALITY_THRESHOLD` / enable `autoPost`. |
| Dashboard not updating live | Confirm `schema.sql` ran (Realtime publication) and the dashboard has the anon key. |
| `Module not found` | Run `npm install` in `pipeline/`; relative imports must keep their `.js` extension (ESM). |
| Claude returns mock despite a key | Check the key and `ANTHROPIC_MODEL`; parse failures fall back to mock and log a warning. |

---

## 11. How the pieces connect

```
Dashboard "Run Pipeline"  ──POST /run──▶  server.js ──▶ runPipeline()
                                                          │ updates pipeline_runs (live)
   generateScript ─▶ generateVoice ─▶ gatherMedia ─▶ generateThumbnail ─▶ renderVideo
        │ writes videos row + run_log at each stage
        ▼
   viralityCheck ──(below threshold / auto-post off)──▶ flag + notify + PAUSE
        │ (approved)
        ▼
   postToPlatforms (parallel) ─▶ posts rows ─▶ repurpose ─▶ runCommentMonitor
                                                                   │
   cron: comments (hourly) · email + analytics (daily) · newsletter (Sun)
        └─ comments ─▶ comments table   leads ─▶ leads table   analytics ─▶ analytics table
```

All of which surfaces in the dashboard's Overview, Videos, Posts, Leads, Comments,
Email, Analytics, and Calendar pages in real time.
