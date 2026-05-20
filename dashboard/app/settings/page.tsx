'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Check, X, Plus, Trash2, Bell, KeyRound, Palette, Mic2, Tag,
  Hash, Target, ChevronDown,
} from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/Badge';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  PLATFORMS,
  PLATFORM_LABELS,
  DEFAULT_CONTENT_PILLARS,
  DEFAULT_HOOK_STYLES,
  DEFAULT_TRIGGER_WORDS,
  DEFAULT_VIRALITY_THRESHOLD,
} from '@shared/constants';
import type { Platform } from '@shared/types';

// ---------------------------------------------------------------------------
// Inline helper: Toggle (gold pill switch)
// ---------------------------------------------------------------------------
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
        checked ? 'bg-gold' : 'bg-white/15',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline helper: EditableList
// ---------------------------------------------------------------------------
function EditableList({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const trimmed = draft.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <p className="mb-3 text-xs text-white/45">{label}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((item, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1.5 pill bg-white/8 text-white/80 border border-white/12"
          >
            {item}
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-white/40 hover:text-rose-400 transition-colors"
              aria-label={`Remove ${item}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-sm text-white/30 italic">No items yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder ?? 'Add item…'}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          type="button"
          onClick={add}
          className="btn btn-ghost flex items-center gap-1.5 text-sm"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section description helper
// ---------------------------------------------------------------------------
function Desc({ children }: { children: React.ReactNode }) {
  return <p className="mb-5 text-sm text-white/45">{children}</p>;
}

// ---------------------------------------------------------------------------
// Connection status indicator
// ---------------------------------------------------------------------------
function ConnectionRow({
  label,
  connected,
  note,
}: {
  label: string;
  connected: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
      <div className="flex items-center gap-3">
        <span
          className={[
            'flex h-6 w-6 items-center justify-center rounded-full',
            connected
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/20 text-rose-400',
          ].join(' ')}
        >
          {connected ? <Check size={13} /> : <X size={13} />}
        </span>
        <span className="text-sm text-white/80">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {connected ? (
          <Badge tone="green">Connected</Badge>
        ) : (
          <span className="text-xs text-white/35">{note ?? 'Set key in .env'}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  // -- Save feedback
  const [saved, setSaved] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSave() {
    setSaved(true);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => setSaved(false), 2500);
  }

  // -- 1. Platforms enabled
  const [platformEnabled, setPlatformEnabled] = useState<Record<Platform, boolean>>(
    Object.fromEntries(PLATFORMS.map((p) => [p, true])) as Record<Platform, boolean>
  );

  // -- 2. Auto-post per platform
  const [autoPost, setAutoPost] = useState<Record<Platform, boolean>>(
    Object.fromEntries(PLATFORMS.map((p) => [p, false])) as Record<Platform, boolean>
  );

  // -- 3. Voice
  const [voiceId, setVoiceId] = useState('');
  const [stability, setStability] = useState(0.5);
  const [similarity, setSimilarity] = useState(0.75);

  // -- 4. Brand
  const [logoFilename, setLogoFilename] = useState<string | null>(null);
  const [colorNavy, setColorNavy] = useState('#0a1a35');
  const [colorGold, setColorGold] = useState('#d4af37');
  const [colorWhite, setColorWhite] = useState('#ffffff');
  const [fontFamily, setFontFamily] = useState('');

  // -- 5-7. Editable lists
  const [pillars, setPillars] = useState<string[]>([...DEFAULT_CONTENT_PILLARS]);
  const [hookStyles, setHookStyles] = useState<string[]>([...DEFAULT_HOOK_STYLES]);
  const [triggerWords, setTriggerWords] = useState<string[]>([...DEFAULT_TRIGGER_WORDS]);

  // -- 8. Virality threshold
  const [viralityThreshold, setViralityThreshold] = useState(DEFAULT_VIRALITY_THRESHOLD);

  // -- 10. Approval workflow
  const [notifChannel, setNotifChannel] = useState<'email' | 'slack'>('email');
  const [notifDest, setNotifDest] = useState('');
  const [requireApproval, setRequireApproval] = useState(true);

  // Helpers
  const togglePlatform = useCallback((p: Platform, val: boolean) => {
    setPlatformEnabled((prev) => ({ ...prev, [p]: val }));
  }, []);

  const toggleAutoPost = useCallback((p: Platform, val: boolean) => {
    setAutoPost((prev) => ({ ...prev, [p]: val }));
  }, []);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Pipeline Settings"
        subtitle="Configure how the content engine runs, posts, and notifies."
        actions={
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-gold flex items-center gap-2 text-sm"
          >
            {saved ? (
              <>
                <Check size={14} />
                Saved ✓
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        }
      />

      <p className="mb-8 text-xs text-white/30">
        Settings are stored in local UI state in this build. Persistence coming in a future release.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Platforms                                                         */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard
        title="Platforms"
        className="mb-6"
      >
        <Desc>Enable or disable individual platforms. Disabled platforms are skipped during pipeline runs.</Desc>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <div
              key={p}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-bg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <PlatformIcon platform={p} size={18} />
                <span className="text-sm text-white/80">{PLATFORM_LABELS[p]}</span>
              </div>
              <Toggle
                checked={platformEnabled[p]}
                onChange={(v) => togglePlatform(p, v)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Auto-Post per Platform                                           */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard
        title="Auto-Post per Platform"
        className="mb-6"
      >
        <Desc>
          When ON the pipeline posts immediately after rendering. When OFF, the post enters the
          approval queue and waits for manual review before publishing.
        </Desc>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <div
              key={p}
              className={[
                'flex items-center justify-between rounded-lg border px-4 py-3 transition-opacity',
                platformEnabled[p] ? 'border-border/60 bg-bg' : 'border-border/30 bg-bg opacity-40 pointer-events-none',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                <PlatformIcon platform={p} size={18} />
                <div>
                  <div className="text-sm text-white/80">{PLATFORM_LABELS[p]}</div>
                  <div className="text-xs text-white/35">
                    {autoPost[p] ? 'Auto-posts' : 'Approval queue'}
                  </div>
                </div>
              </div>
              <Toggle
                checked={autoPost[p]}
                onChange={(v) => toggleAutoPost(p, v)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Voice (ElevenLabs)                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Mic2 size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Voice (ElevenLabs)</h2>
        </div>
        <Desc>Configure the default voice for AI-generated voiceovers.</Desc>
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Default Voice ID</label>
            <input
              className="input w-full text-sm font-mono"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder="21m00Tcm4TlvDq8ikWAM"
            />
            <p className="mt-1.5 text-xs text-white/30">
              Find your Voice ID in the ElevenLabs dashboard under Voices.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs text-white/50">
                <span>Stability</span>
                <span className="text-gold font-medium">{stability.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stability}
                onChange={(e) => setStability(parseFloat(e.target.value))}
                className="w-full accent-[#d4af37] cursor-pointer"
              />
              <div className="mt-1 flex justify-between text-xs text-white/25">
                <span>Variable</span>
                <span>Stable</span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs text-white/50">
                <span>Similarity Boost</span>
                <span className="text-gold font-medium">{similarity.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={similarity}
                onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                className="w-full accent-[#d4af37] cursor-pointer"
              />
              <div className="mt-1 flex justify-between text-xs text-white/25">
                <span>Low</span>
                <span>High</span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Brand                                                            */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Palette size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Brand</h2>
        </div>
        <Desc>Set your brand assets used in thumbnails, templates, and email footers.</Desc>
        <div className="space-y-5">
          {/* Logo upload */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Logo</label>
            <label
              className={[
                'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors',
                'border-border/60 hover:border-gold/40 hover:bg-gold/5',
              ].join(' ')}
            >
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setLogoFilename(file.name);
                }}
              />
              <span className="flex h-8 w-8 items-center justify-center rounded border border-border bg-surface-2 text-white/40">
                <Plus size={14} />
              </span>
              <div>
                <div className="text-sm text-white/70">
                  {logoFilename ?? 'Click to upload logo'}
                </div>
                <div className="text-xs text-white/30">PNG, SVG, or WebP recommended</div>
              </div>
            </label>
          </div>

          {/* Color swatches */}
          <div>
            <label className="mb-2 block text-xs text-white/50">Brand Colors</label>
            <div className="flex flex-wrap gap-4">
              {[
                { label: 'Navy', value: colorNavy, set: setColorNavy },
                { label: 'Gold', value: colorGold, set: setColorGold },
                { label: 'White', value: colorWhite, set: setColorWhite },
              ].map(({ label, value, set }) => (
                <label key={label} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0 appearance-none"
                    style={{ backgroundColor: value }}
                  />
                  <div>
                    <div className="text-xs font-medium text-white/70">{label}</div>
                    <div className="font-mono text-xs text-white/40">{value.toUpperCase()}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Font family */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Font Family</label>
            <input
              className="input w-full text-sm"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder="e.g. Syne, DM Sans, Inter"
            />
          </div>
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Content Pillars                                                  */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Tag size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Content Pillars</h2>
        </div>
        <EditableList
          label="Topics and categories that drive your content strategy. The AI uses these to generate video ideas."
          items={pillars}
          onChange={setPillars}
          placeholder="Add a content pillar…"
        />
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Hook Styles                                                      */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Target size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Hook Styles</h2>
        </div>
        <EditableList
          label="Opening hook patterns Claude cycles through when scripting videos. Mix aggressive and storytelling styles."
          items={hookStyles}
          onChange={setHookStyles}
          placeholder="Add a hook style…"
        />
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 7. Lead Trigger Words                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Hash size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Lead Trigger Words</h2>
        </div>
        <EditableList
          label="Keywords that flag a comment or DM as a potential lead. Case-insensitive during detection."
          items={triggerWords}
          onChange={setTriggerWords}
          placeholder="Add a trigger word…"
        />
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 8. Virality Threshold                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Target size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Virality Threshold</h2>
        </div>
        <Desc>Videos scoring below this threshold are flagged for review instead of auto-posted.</Desc>
        <div className="flex items-center gap-6">
          <div className="text-5xl font-semibold text-gold tabular-nums w-12 text-center">
            {viralityThreshold}
          </div>
          <div className="flex-1">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={viralityThreshold}
              onChange={(e) => setViralityThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-[#d4af37] cursor-pointer"
            />
            <div className="mt-1 flex justify-between text-xs text-white/25">
              <span>1 — Post everything</span>
              <span>10 — Only viral content</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 9. API Connections                                                  */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">API Connections</h2>
        </div>
        <Desc>Connection status based on environment variables. Set missing keys in your .env.local file.</Desc>
        <div className="divide-y divide-border/60">
          <ConnectionRow label="Supabase" connected={isSupabaseConfigured} />
          <ConnectionRow label="Anthropic Claude" connected={false} note="Set ANTHROPIC_API_KEY in .env" />
          <ConnectionRow label="ElevenLabs" connected={false} note="Set ELEVENLABS_API_KEY in .env" />
          <ConnectionRow label="Resend" connected={false} note="Set RESEND_API_KEY in .env" />
          <ConnectionRow label="Remotion" connected={false} note="Set REMOTION_LICENSE in .env" />
        </div>
        <p className="mt-4 text-xs text-white/25">
          Non-Supabase keys are server-side only and cannot be verified in the browser. After setting a key, redeploy to reflect status.
        </p>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* 10. Approval Workflow                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Bell size={16} className="text-gold/70" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Approval Workflow</h2>
        </div>
        <Desc>Configure how you are notified when posts enter the approval queue.</Desc>
        <div className="space-y-5">
          {/* Require approval toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-bg px-4 py-3">
            <div>
              <div className="text-sm text-white/80">Require approval before posting</div>
              <div className="text-xs text-white/35">
                {requireApproval
                  ? 'Posts wait for manual approval'
                  : 'Posts go live without review'}
              </div>
            </div>
            <Toggle checked={requireApproval} onChange={setRequireApproval} />
          </div>

          {/* Notification channel */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">Notification Channel</label>
            <div className="relative">
              <select
                className="input w-full appearance-none pr-8 text-sm"
                value={notifChannel}
                onChange={(e) => setNotifChannel(e.target.value as 'email' | 'slack')}
              >
                <option value="email">Email</option>
                <option value="slack">Slack</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
              />
            </div>
          </div>

          {/* Notification destination */}
          <div>
            <label className="mb-1.5 block text-xs text-white/50">
              {notifChannel === 'email' ? 'Email Address' : 'Slack Webhook URL'}
            </label>
            <input
              className="input w-full text-sm"
              type={notifChannel === 'email' ? 'email' : 'url'}
              value={notifDest}
              onChange={(e) => setNotifDest(e.target.value)}
              placeholder={
                notifChannel === 'email'
                  ? 'you@example.com'
                  : 'https://hooks.slack.com/services/…'
              }
            />
          </div>
        </div>
      </SectionCard>

      {/* Bottom save bar */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4">
        <p className="text-xs text-white/30">
          Settings are stored in local UI state in this build. Persistence coming in a future release.
        </p>
        <button
          type="button"
          onClick={handleSave}
          className="btn btn-gold flex items-center gap-2 text-sm"
        >
          {saved ? (
            <>
              <Check size={14} />
              Saved ✓
            </>
          ) : (
            'Save Settings'
          )}
        </button>
      </div>
    </div>
  );
}
