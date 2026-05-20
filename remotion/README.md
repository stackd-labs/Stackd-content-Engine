# /remotion — Video Templates (Stage 3)

Remotion compositions used by the pipeline's `render` stage to produce the actual
video files written to `/output/videos`.

Planned compositions, one per format in `shared/constants.ts → FORMATS`:

- **short** — vertical 9:16, ~20–60s (TikTok / Reels / Shorts)
- **medium** — 1–5 min
- **long** — 5–12 min

Each composition takes the generated script + the ElevenLabs voiceover track and
renders captioned, branded (navy/gold) video. Wire `npx remotion render` into the
pipeline's render stage.
