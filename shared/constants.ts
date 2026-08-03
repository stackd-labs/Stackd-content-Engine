// ============================================================
// Shared constants for the Stackd Content Engine.
// ============================================================

import type { ContentType, Platform, VideoFormat } from './types';

export const PLATFORMS: Platform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'linkedin',
  'facebook',
  'twitter',
];

export const FORMATS: VideoFormat[] = ['short', 'medium', 'long'];

export const CONTENT_TYPES: ContentType[] = ['video', 'photo'];

// YouTube has no photo-post equivalent in this pipeline's posting flow (Community
// image posts are a separate, unrelated API) — every other platform's uploader
// implements a real photo endpoint. Photo runs filter enabledPlatforms through this.
export const PHOTO_CAPABLE_PLATFORMS: Platform[] = [
  'tiktok',
  'instagram',
  'linkedin',
  'facebook',
  'twitter',
];

// The 12 pipeline stages a video moves through, in order.
export const PIPELINE_STAGES = [
  'ideate',
  'research',
  'script',
  'score_virality',
  'voiceover',
  'render',
  'thumbnail',
  'caption',
  'schedule',
  'post',
  'capture_leads',
  'pull_analytics',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  ideate: 'Ideating topic',
  research: 'Researching',
  script: 'Writing script (Claude)',
  score_virality: 'Scoring virality',
  voiceover: 'Generating voiceover (ElevenLabs)',
  render: 'Rendering video (Remotion)',
  thumbnail: 'Creating thumbnail',
  caption: 'Writing captions & hashtags',
  schedule: 'Scheduling posts',
  post: 'Publishing to platforms',
  capture_leads: 'Listening for leads',
  pull_analytics: 'Pulling analytics',
};

// Default editable libraries (mirrored in Pipeline Settings).
export const DEFAULT_CONTENT_PILLARS = [
  'AI Automation',
  'Build in Public',
  'Client Wins',
  'Founder Mindset',
  'Tools & Tutorials',
  'Behind the Build',
];

export const DEFAULT_HOOK_STYLES = [
  'Bold Claim',
  'Contrarian Take',
  'Question Hook',
  'Story Open',
  'Stat Shock',
  'How-To Promise',
  'Mistake Callout',
];

export const DEFAULT_TRIGGER_WORDS = [
  'AUTOMATE',
  'BUILD',
  'STACKD',
  'SYSTEM',
  'BLUEPRINT',
];

export const DEFAULT_VIRALITY_THRESHOLD = 6;

// Platforms with a real OAuth "Connect" flow wired up (app credentials
// already registered — see pipeline/src/lib/oauth/*.js). The rest have
// working uploaders but no OAuth app yet, so the Settings page shows a
// "Requires app setup" state for them instead of a working Connect button.
export const OAUTH_CONNECTABLE_PLATFORMS: Platform[] = ['youtube', 'tiktok', 'twitter'];

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitter: 'X / Twitter',
};

// Brand palette (also expressed as Tailwind tokens).
export const BRAND = {
  bg: '#0f0f0f',
  surface: '#161616',
  navy: '#0a1a35',
  navyLight: '#13294b',
  gold: '#d4af37',
  goldSoft: '#e8c766',
  white: '#ffffff',
} as const;
