// ============================================================
// Shared types for the Stackd Content Engine.
// Mirrors the Supabase schema in pipeline/supabase/schema.sql.
// Imported by both /dashboard and /pipeline.
// ============================================================

export type VideoStatus =
  | 'drafting'
  | 'producing'
  | 'rendering'
  | 'posting'
  | 'live'
  | 'failed'
  | 'flagged';

export type VideoFormat = 'short' | 'medium' | 'long';

// 'photo' content skips voiceover + render entirely — see pipeline/README.md § Photo posts.
export type ContentType = 'video' | 'photo';

export type Platform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'linkedin'
  | 'facebook'
  | 'twitter';

export type PostStatus = 'scheduled' | 'posted' | 'failed';
export type PostFormat = 'landscape' | 'vertical' | 'square';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'booked'
  | 'converted'
  | 'dead';

export type CommentSentiment =
  | 'positive'
  | 'question'
  | 'negative'
  | 'spam'
  | 'trigger';

export type CommentResponseStatus = 'pending' | 'approved' | 'posted' | 'skipped';
export type EmailStatus = 'active' | 'unsubscribed';
export type CalendarStatus =
  | 'planned'
  | 'in_production'
  | 'ready'
  | 'posted'
  | 'skipped';
export type PipelineStatus = 'running' | 'completed' | 'failed';

export interface RunLogEntry {
  stage: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  message?: string;
  at?: string;
}

export interface Video {
  id: string;
  title: string;
  topic: string | null;
  script: string | null;
  status: VideoStatus;
  created_at: string;
  published_at: string | null;
  duration_seconds: number | null;
  format: VideoFormat;
  content_type: ContentType;
  thumbnail_url: string | null;
  video_file_path: string | null;
  audio_file_path: string | null;
  virality_score: number | null;
  hook_style: string | null;
  content_pillar: string | null;
  run_log: RunLogEntry[];
  // Snapshot of { strategy, files, thumbnails, platforms } captured when
  // viralityCheck flags this video; consumed by approveAndPost. Cleared
  // once posting resumes.
  pending_post_payload?: Record<string, unknown> | null;
}

export interface Post {
  id: string;
  video_id: string | null;
  platform: Platform;
  status: PostStatus;
  platform_post_id: string | null;
  platform_url: string | null;
  posted_at: string | null;
  scheduled_for: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  utm_link: string | null;
  format: PostFormat;
  content_type: ContentType;
}

export interface Analytics {
  id: string;
  post_id: string | null;
  platform: string | null;
  pulled_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_seconds: number;
  click_throughs: number;
  followers_gained: number;
}

export interface ConversationTurn {
  role: 'lead' | 'agent';
  text: string;
  at?: string;
}

export interface Lead {
  id: string;
  source_platform: string | null;
  source_post_id: string | null;
  source_video_id: string | null;
  name: string | null;
  handle: string | null;
  email: string | null;
  trigger_word: string | null;
  conversation_log: ConversationTurn[];
  status: LeadStatus;
  created_at: string;
  notes: string | null;
}

export interface Comment {
  id: string;
  post_id: string | null;
  platform: string | null;
  commenter_handle: string | null;
  comment_text: string | null;
  sentiment: CommentSentiment | null;
  response_text: string | null;
  response_status: CommentResponseStatus;
  created_at: string;
}

export interface EmailSubscriber {
  id: string;
  subscriber_email: string;
  first_name: string | null;
  source_video_id: string | null;
  source_platform: string | null;
  subscribed_at: string;
  sequence_step: number;
  last_email_sent: string | null;
  status: EmailStatus;
}

export interface CalendarEntry {
  id: string;
  scheduled_date: string;
  topic: string | null;
  content_pillar: string | null;
  format: VideoFormat;
  status: CalendarStatus;
  video_id: string | null;
  notes: string | null;
}

export interface PipelineRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  topic: string | null;
  status: PipelineStatus;
  stages_completed: string[];
  error_message: string | null;
  output_log: RunLogEntry[];
}

// Joined / view-model helpers used by the dashboard ------------
export interface PostWithVideo extends Post {
  video?: Pick<Video, 'title' | 'content_pillar' | 'hook_style'> | null;
  analytics?: Analytics | null;
}
