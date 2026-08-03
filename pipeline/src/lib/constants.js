// ============================================================
// Shared constants for the pipeline engine.
// Mirrors dashboard/shared/constants.ts (the pipeline is plain
// ESM JS and can't import the dashboard's .ts directly).
// ============================================================

export const CONTENT_PILLARS = [
  'AI Automation',
  'Build in Public',
  'Client Wins',
  'Founder Mindset',
  'Tools & Tutorials',
  'Behind the Build',
];

export const HOOK_STYLES = [
  'controversy',
  'curiosity gap',
  'direct callout',
  'bold claim',
  'story open',
  'number hook',
];

export const TRIGGER_WORDS = ['AUTOMATE', 'BUILD', 'STACKD', 'SYSTEM', 'BLUEPRINT'];

export const PLATFORMS = ['youtube', 'tiktok', 'instagram', 'linkedin', 'facebook', 'twitter'];

export const FORMATS = ['short', 'medium', 'long'];

export const CONTENT_TYPES = ['video', 'photo'];

// YouTube has no photo-post equivalent here — see platforms/index.js.
export const PHOTO_CAPABLE_PLATFORMS = ['tiktok', 'instagram', 'linkedin', 'facebook', 'twitter'];

// Target durations (seconds) per format.
export const FORMAT_DURATIONS = {
  short: { min: 20, max: 60, target: 45 },
  medium: { min: 120, max: 300, target: 180 },
  long: { min: 420, max: 720, target: 540 },
};

// Render dimensions per output orientation.
export const VIDEO_DIMENSIONS = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

// DALL·E 3 only accepts these 3 exact sizes — they map 1:1 onto the same
// landscape/vertical/square orientation buckets used everywhere else, so
// generatePhotos.js can reuse the same PLATFORM_ORIENTATION lookup as renderVideo.
export const DALLE_SIZE_BY_ORIENTATION = {
  landscape: '1792x1024',
  vertical: '1024x1792',
  square: '1024x1024',
};

// Which orientation each platform consumes.
export const PLATFORM_ORIENTATION = {
  youtube: 'landscape',
  tiktok: 'vertical',
  instagram: 'vertical',
  linkedin: 'landscape',
  facebook: 'landscape',
  twitter: 'square',
};

export const DEFAULT_VIRALITY_THRESHOLD = 6;

export const FPS = 30;

// Ordered pipeline stages (matches the dashboard's stage tracker).
export const PIPELINE_STAGES = [
  'script',
  'voiceover',
  'media',
  'thumbnail',
  'render',
  'virality_check',
  'post',
  'repurpose',
  'engagement',
];

export const BRAND = {
  bg: '#0f0f0f',
  navy: '#0a1a35',
  navyLight: '#13294b',
  gold: '#d4af37',
  goldSoft: '#e8c766',
  white: '#ffffff',
  name: 'STACKD STUDIOS',
  sub: 'Content Engine',
};
