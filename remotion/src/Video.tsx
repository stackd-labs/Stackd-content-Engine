// ============================================================
// Main Remotion composition — shared by all 3 orientations.
// Orchestrates: background B-roll, intro bumper, shot text,
// word-level captions, audio tracks, branding overlay, outro CTA.
// ============================================================
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import {
  BackgroundLayer,
  Branding,
  Captions,
  IntroBumper,
  OutroBumper,
  AnimationBullets,
  type BrandConfig,
  type MediaItem,
  type WordTimestamp,
  type ShotItem,
} from './components';

// ---- types ---------------------------------------------------------

export interface VideoProps {
  strategy: {
    videoId?:         string;
    title?:           string;
    recommendedHook?: string;
    script?:          string;
    shotList:         ShotItem[];
    durationSeconds?: number;
    captions?:        unknown[];
  };
  audioSrc:       string;
  wordTimestamps: WordTimestamp[];
  media:          MediaItem[];
  musicSrc:       string | null;
  brand:          BrandConfig;
  orientation:    'landscape' | 'vertical' | 'square';
}

// ---- component ----------------------------------------------------

export function VideoComposition({
  strategy,
  audioSrc,
  wordTimestamps,
  media,
  musicSrc,
  brand,
  orientation,
}: VideoProps) {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const shotList: ShotItem[] = strategy.shotList ?? [];

  // Intro: first 2s (60 frames); Outro: last 3s (90 frames).
  const INTRO_FRAMES = fps * 2;
  const OUTRO_FRAMES = fps * 3;

  // Main body lives between intro and outro.
  const bodyStart  = INTRO_FRAMES;
  const bodyEnd    = durationInFrames - OUTRO_FRAMES;
  const bodyFrames = Math.max(1, bodyEnd - bodyStart);

  const seconds = frame / fps;
  const isVertical = orientation === 'vertical';

  // Navy background fallback (always behind everything)
  const navyBg = brand.navy ?? '#0a1a35';

  // ---- shot overlays -----------------------------------------------
  const shotOverlays = shotList.map((shot) => {
    // Convert shot time (seconds relative to voice, offset by intro) to frames
    const shotStartFrame = INTRO_FRAMES + Math.round(shot.start * fps);
    const shotEndFrame   = INTRO_FRAMES + Math.round(shot.end   * fps);
    const shotDuration   = Math.max(1, shotEndFrame - shotStartFrame);

    return (
      <Sequence
        key={shot.index}
        from={shotStartFrame}
        durationInFrames={shotDuration}
        layout="none"
      >
        <AnimationBullets
          bullets={shot.animationBullets ?? []}
          brand={brand}
          orientation={orientation}
          localFrame={frame - shotStartFrame}
        />
      </Sequence>
    );
  });

  // ---- hook / title overlay in body ---------------------------------
  const hook = strategy.recommendedHook || strategy.title || '';
  const hookOpacity = frame < INTRO_FRAMES + 30
    ? 0
    : frame < INTRO_FRAMES + 50
      ? (frame - (INTRO_FRAMES + 30)) / 20
      : frame > bodyEnd - 20
        ? (bodyEnd - frame) / 20
        : 1;
  const hookFontSize = isVertical ? 40 : 32;

  return (
    <AbsoluteFill style={{ backgroundColor: navyBg }}>

      {/* ---- Layer 0: B-roll background ---- */}
      <AbsoluteFill>
        <BackgroundLayer
          shotList={shotList}
          media={media}
          brand={brand}
          orientation={orientation}
        />
      </AbsoluteFill>

      {/* ---- Layer 1: Intro bumper (first 2s) ---- */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES} layout="none">
        <AbsoluteFill style={{ backgroundColor: navyBg }}>
          <IntroBumper brand={brand} orientation={orientation} />
        </AbsoluteFill>
      </Sequence>

      {/* ---- Layer 2: Main body ---- */}
      <Sequence from={bodyStart} durationInFrames={bodyFrames} layout="none">
        {/* Hook / title */}
        {hook.length > 0 && (
          <div
            style={{
              position:       'absolute',
              top:            isVertical ? 80 : 50,
              left:           0,
              right:          0,
              textAlign:      'center',
              padding:        '0 60px',
              opacity:        hookOpacity,
            }}
          >
            <div
              style={{
                color:       brand.white ?? '#ffffff',
                fontSize:    hookFontSize,
                fontWeight:  900,
                fontFamily:  'system-ui, -apple-system, sans-serif',
                textShadow:  '0 2px 12px rgba(0,0,0,0.9)',
                lineHeight:  1.3,
              }}
            >
              {hook}
            </div>
          </div>
        )}
      </Sequence>

      {/* ---- Layer 3: Shot animation bullets ---- */}
      {shotOverlays}

      {/* ---- Layer 4: Word-level captions ---- */}
      <Sequence from={INTRO_FRAMES} durationInFrames={bodyFrames} layout="none">
        <Captions
          wordTimestamps={wordTimestamps}
          orientation={orientation}
          brand={brand}
        />
      </Sequence>

      {/* ---- Layer 5: Persistent branding ---- */}
      <Branding brand={brand} orientation={orientation} />

      {/* ---- Layer 6: Outro CTA (last 3s) ---- */}
      <Sequence from={bodyEnd} durationInFrames={OUTRO_FRAMES} layout="none">
        <AbsoluteFill style={{ backgroundColor: `${navyBg}ee` }}>
          <OutroBumper
            brand={brand}
            orientation={orientation}
            totalFrames={durationInFrames}
          />
        </AbsoluteFill>
      </Sequence>

      {/* ---- Audio: voiceover ---- */}
      {audioSrc && audioSrc.length > 0 && (
        <Audio src={audioSrc} startFrom={0} />
      )}

      {/* ---- Audio: background music (ducked) ---- */}
      {musicSrc && musicSrc.length > 0 && (
        <Audio src={musicSrc} volume={0.12} startFrom={0} />
      )}

    </AbsoluteFill>
  );
}

export default VideoComposition;
