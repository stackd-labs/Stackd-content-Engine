# Session Handoff — 2026-08-03

Status snapshot after a session that ended abruptly (machine became unresponsive) partway
through the next task. Everything below except the last section is **implemented and
verified, but not committed** — see `git status` (all changes are unstaged/untracked on
branch `rhona`).

## 1. Approve & Post for flagged videos — done

Mirrors the existing comments/newsletter approve pattern, but is the only one of the three
that's *actually wired to a real backend call* (comments/newsletter approve buttons are
still locally-mocked).

- `pipeline/src/index.js` — snapshots `{ strategy, files, thumbnails, platforms }` into a
  new `videos.pending_post_payload` column at the point `viralityCheck.js` flags a video.
- `pipeline/src/platforms/index.js` — new `approveAndPost(videoId)`: loads the video,
  validates status is `flagged`, pulls `pending_post_payload`, sets status to `posting`,
  re-enters `postToPlatforms` (→ `live` + clears payload on success).
- `pipeline/src/server.js` — new `POST /approve/:videoId` (same 202-then-background shape
  as `/run`).
- `dashboard/app/api/approve-video/` — new route, mirrors `/api/run-pipeline`.
- `dashboard/app/videos/page.tsx` — **Approve & Post** button in the flagged-video detail
  panel; `selectedSync` keeps it live via Supabase realtime (same pattern as
  `comments/page.tsx`), so the button disappears once posting completes.

## 2. Real comment fetch + DM send — done

- `pipeline/src/engagement/commentMonitor.js` — `fetchNewComments()` no longer hardcodes
  `hasPlatformCreds = false`. Real per-platform fetchers added: YouTube
  `commentThreads.list`, Instagram/Facebook Graph comments edge, LinkedIn Social Actions,
  Twitter conversation search — each gated by `has(...)` credential checks. Platforms
  without live keys still fall back to the demo example.
- `pipeline/src/engagement/dmHandler.js` — added `sendDM()`, wired into both
  `startDmSequence` and `handleDmReply` (main reply + calendar-link follow-up).
  - Twitter: works any time (handle→user-id resolution + DM API).
  - Instagram/Facebook: only work off the triggering comment's ID (Meta Private Replies
    API) — follow-ups are honestly logged as non-deliverable, not faked.
  - TikTok/LinkedIn/YouTube: no viable send-message API — logged via the existing
    `log.mock` convention.
- Reused the OAuth1 signer from `uploadToTwitter.js` (exported it) instead of duplicating
  HMAC signing.
- AI classification/drafting and the dashboard approval UI were **not** touched.

## 3. Real analytics — done

`pipeline/src/analytics/pullAnalytics.js` — replaced fabricated hash-seeded metrics with
real fetchers, same `has(...)`-gated pattern, each failing soft to `demoMetrics()` on error:

- **YouTube Analytics API** (`youtubeanalytics.googleapis.com/v2/reports`) — reuses the
  OAuth refresh flow from `uploadToYouTube.js`.
- **TikTok** — resolves real `video_id` via `publish/status/fetch`, then
  `v2/video/query/` for like/comment/share/view counts.
- **Meta Insights API** (Instagram + Facebook) — `/insights` edge (reach/impressions) +
  Graph node fields (likes/comments/shares).

Weekly-insight generator and calendar-suggestion engine (both downstream Claude calls
inside this same file) now get real numbers automatically — no changes needed there.

**Credential scope gaps flagged in `.env.example`:**
| Token | Posting needs | Analytics also needs |
|---|---|---|
| `YOUTUBE_REFRESH_TOKEN` | `youtube.upload` | `yt-analytics.readonly` |
| `TIKTOK_ACCESS_TOKEN` | `video.publish` | `video.list` (+ creator must manually publish out of `SELF_ONLY` draft mode) |
| `INSTAGRAM_ACCESS_TOKEN` | — | `instagram_manage_insights`, Business/Creator account only |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | — | `read_insights` |

LinkedIn and Twitter analytics were out of scope — left on demo metrics.

## 4. OAuth "Connect [Platform]" flow — done (14/14 planned tasks)

Replaces manual `.env` token pasting with a real per-platform OAuth flow, built as a
first step toward multi-tenant (every row/query carries `tenant_id`, defaulted to
`'default'` — no schema change needed when real multi-tenancy lands).

**Live for YouTube, TikTok, Twitter:**
- New Supabase table `platform_credentials` (RLS deny-all, service-role only) — defined
  in `pipeline/supabase/schema.sql` but **not yet applied to the live project** (no
  Supabase CLI / direct DB connection in this environment). *Action needed: run the
  `platform_credentials` block from `schema.sql` in the Supabase SQL editor.* Until then
  everything correctly falls back to `.env`, verified live.
- `pipeline/src/lib/credentials.js` + `pipeline/src/lib/oauth/{youtube,tiktok,twitter}.js`
  — provider modules with refresh functions; Twitter's signer was generalized (not just
  reused) to accept an arbitrary resolved credential.
- `pipeline/src/server.js` — two new endpoints (authorize-url + callback dispatch),
  verified against real Google/TikTok/Twitter endpoints.
- Dashboard: `dashboard/app/api/oauth/` (status, disconnect, start, callback routes),
  `dashboard/lib/supabaseAdmin.ts` (server-only client), Settings page → new
  **Connected Accounts** section with a "Connect [Platform]" button per platform.
- Every call site migrated to resolve credentials via `getPlatformCredential()` (prefers
  the Connect-flow row, falls back to `.env`): `uploadToYouTube.js`, `uploadToTikTok.js`,
  `uploadToTwitter.js`, `pullAnalytics.js`, `commentMonitor.js`'s Twitter fetch,
  `dmHandler.js`'s Twitter send.
- Security verified: CSRF state mismatch, missing cookie, provider denial all redirect
  with honest errors (no silent demo-mode swallowing on a Connect click).
- **Note:** the dashboard's real port is **3030**, not 3000 — `APP_URL` default in both
  OAuth routes was corrected to match.

**Instagram, Facebook, LinkedIn:** show a "Requires app setup" state — no OAuth app
exists yet for these, so a real Connect button isn't buildable without first registering
one with each platform.

## 5. Dashboard auth — done (picked up after the cutoff, completed 2026-08-03)

- **Login gate**: `dashboard/components/LoginScreen.tsx` (email/password + Google OAuth,
  mirrors `stackddash-main/components/LoginScreen.tsx`'s pattern) + `AppGate.tsx` (mirrors
  `stackddash-main/components/AppShell.tsx`'s session-check logic), wrapping all page
  chrome in `dashboard/app/layout.tsx`. Sign-out control added to `Sidebar.tsx`'s footer.
  **Only activates when Supabase is configured** — with no Supabase project connected,
  the dashboard stays in its documented zero-config demo mode, ungated, unchanged. This
  was a deliberate call (not explicitly specified in the request) to preserve the
  "runs with zero configuration" promise in the top-level README; flag if you'd rather
  the gate apply unconditionally.
- **Server-side route guards**: `dashboard/lib/requireUser.ts` verifies the
  `Authorization: Bearer <access_token>` header against Supabase Auth (401 if missing/
  invalid) — same demo-mode passthrough rule as above. Applied to `/api/run-pipeline`
  and `/api/ai`. `dashboard/lib/authFetch.ts` attaches the current session's token
  automatically; swapped in at all 4 call sites (`RunPipelineButton.tsx`,
  `emails/page.tsx`, `calendar/page.tsx`, `analytics/page.tsx`).
- **Pipeline server `POST /run`**: new `PIPELINE_SHARED_SECRET` — when set, requires
  `Authorization: Bearer <secret>` (the dashboard's `/api/run-pipeline` route sends it
  automatically once both `.env` files have it set); unset, `/run` stays open with a
  startup warning logged. Verified live: no header → 401, wrong secret → 401, correct
  secret → 202.
- **Pipeline server `POST /lead`**: asked you how to handle this one specifically, since
  it's the public lead-magnet capture endpoint hit directly by anonymous visitors'
  browsers (confirmed via `settings.leadMagnet.url` → `stackdstudiosai.com/free/toolkit`)
  — gating it behind login would've silently broken that funnel. You chose **rate-limit +
  origin allowlist**: `LEAD_CAPTURE_ALLOWED_ORIGIN` (default `stackdstudiosai.com`) + 5
  requests/10min per IP, in-memory. Verified live: wrong `Origin` → 403, 6th rapid request
  → 429, correct origin under the limit → passes through to `captureLead`.
- **Explicitly out of scope, still open**: `POST /approve/:videoId` and the pipeline's
  `/oauth/*` endpoints have neither protection — only the 4 endpoints named in the
  request were touched, per "don't touch any pipeline logic beyond the auth checks."
  Flagged in `pipeline/README.md` § Security: if this server gets a public hostname,
  put it behind a private network/VPN rather than relying on endpoint checks alone.
- **Not verified in a real browser** (no browser available in this environment): the
  client-side login/sign-out UI is exercised logically and via `tsc --noEmit` (clean),
  but not click-tested. The server-side checks (the part that actually stops someone who
  "just finds the URL") were verified live via curl — see above.

## Update — 2026-08-04

Everything in §1–5 above was reviewed, committed (`d83c4f1`), and pushed to `origin/rhona`.
One session later, a second feature — photo posts — was designed, built, verified, and
merged into the same branch. Both are now live on `origin/rhona`; nothing is sitting
uncommitted.

### 6. Photo-post content type — done

Added a second content type, `'photo'`, alongside the existing video pipeline — a single-
image post per platform instead of a full script→voiceover→render pipeline. Built on a new
branch `photo-support` (off `rhona`), then fast-forward-merged into `rhona` and pushed
(`d83c4f1..3dafeca`); `photo-support` still exists on origin/local but is now redundant.

- `shared/types.ts` + `shared/constants.ts` + `pipeline/src/lib/constants.js` — new
  `ContentType` (`'video' | 'photo'`), `PHOTO_CAPABLE_PLATFORMS` (all 5 non-YouTube
  platforms — YouTube has no photo-post equivalent in this pipeline).
- `pipeline/supabase/schema.sql` — new `content_type` enum + column on `videos` and
  `posts`, defaulting to `'video'` (idempotent `alter`s, so this is safe to run on the
  existing live project alongside the still-unapplied `platform_credentials` block from
  §4 — same SQL editor trip covers both).
- `pipeline/src/stages/generateScript.js` — branches on `contentType`: photo mode produces
  a lighter strategy (hook + single `imagePrompt` + captions/hashtags/SEO/virality score,
  no script or timestamped shot list).
- New `pipeline/src/stages/generatePhotos.js` — DALL·E 3 renders landscape/vertical/square
  images and returns the exact same `{landscape, vertical, square}` shape `renderVideo.js`
  does, so `postToPlatforms` and every uploader's `files[ORIENTATION]` lookup needed zero
  interface changes.
- `pipeline/src/index.js` — skips voiceover/media/thumbnail/render/repurpose for photo
  runs (all video-specific), calls `generatePhotos` instead, and automatically drops
  `youtube` from the platform list with a logged warning.
- `pipeline/src/platforms/index.js` + all 5 non-YouTube uploader files — new
  `uploadPhotoTo{TikTok,Instagram,LinkedIn,Facebook,Twitter}` functions, each hitting that
  platform's real photo endpoint (simpler than video every time — no resumable upload, no
  processing-status polling for images).
- `dashboard/lib/placeholder.ts` — demo data now includes photo-type videos/posts (every
  5th item), so the zero-config demo mode exercises both content types.

**Verified live (demo mode, not a real API key anywhere):** photo runs correctly drop
YouTube and post to the other 5, both when relying on `enabledPlatforms` and when YouTube
is explicitly requested; video runs are unchanged (regression-tested side by side).
`node scripts/check.js` passes all 42 pipeline files; dashboard `tsc --noEmit` passes with
the new required `content_type` field.

**Not done, explicitly out of scope for this pass:**
- No dashboard UI to pick `contentType` on the Run Pipeline button yet — the
  `/api/run-pipeline` route already forwards whatever body it's given verbatim, so this is
  a UI-only addition when wanted.
- TikTok's and Instagram's photo endpoints were implemented against known API shape,
  following the same "real request + safe mock fallback" convention as the rest of the
  codebase, but **not exercised against a live sandbox** — verify before flipping
  `autoPost` on for real photo content, since platform APIs do drift.
- Photo mode posts a single image per platform, not a carousel — carousels would be a
  follow-up, not built here.
- Instagram's and TikTok's photo endpoints require a *publicly reachable* image URL (no
  raw file-bytes upload for photos, unlike video) — `INSTAGRAM_VIDEO_BASE_URL` (reused) and
  the new `TIKTOK_PHOTO_BASE_URL` need to point at real hosting before this goes live;
  `/output/photos` is local-only right now.

## Outstanding actions for you

1. Run `pipeline/supabase/schema.sql` in the live Supabase SQL editor — covers both the
   still-unapplied `platform_credentials` block (§4) and the new `content_type`
   enum/column (§6).
2. Set `PIPELINE_SHARED_SECRET` (same value) in both `pipeline/.env` and
   `dashboard/.env.local` before deploying beyond localhost — otherwise `/run` stays
   unauthenticated.
3. Create Supabase Auth users for your team (Supabase dashboard → Authentication → Users)
   — that's the login for the dashboard once Supabase is configured live.
4. Click through the login flow once in a real browser to confirm the UI end-to-end.
5. Set `INSTAGRAM_VIDEO_BASE_URL` and `TIKTOK_PHOTO_BASE_URL` to real hosting before
   posting real (non-mock) photos.
6. Decide when/whether to open a `rhona → main` PR — nothing's been opened yet.
7. Optional cleanup: delete the now-redundant `photo-support` branch (fully merged into
   `rhona`) on origin and local, if you don't want it hanging around.
