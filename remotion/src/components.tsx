// ============================================================
// Remotion helper components for the Stackd Content Engine.
// Used by Video.tsx — also exported for testing in Remotion Studio.
// ============================================================
import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// ---- shared brand colours (fallback when no brand prop) --------
export const DEFAULT_BRAND = {
  navy:     '#0a1a35',
  navyLight:'#13294b',
  gold:     '#d4af37',
  goldSoft: '#e8c766',
  white:    '#ffffff',
  name:     'STACKD STUDIOS',
  sub:      'Content Engine',
};

// ---- type definitions ------------------------------------------

export interface BrandConfig {
  navy?:      string;
  navyLight?: string;
  gold?:      string;
  goldSoft?:  string;
  white?:     string;
  name?:      string;
  sub?:       string;
}

export interface MediaItem {
  path:      string;
  type:      'image' | 'video' | string;
  shotIndex?: number;
  startTime?: number;
  endTime?:   number;
}

export interface WordTimestamp {
  word:  string;
  start: number;
  end:   number;
}

export interface ShotItem {
  index:            number;
  start:            number;
  end:              number;
  visual:           string;
  brollQuery?:      string;
  animationBullets: string[];
}

// ---- BackgroundLayer -------------------------------------------

interface BackgroundLayerProps {
  shotList:    ShotItem[];
  media:       MediaItem[];
  brand:       BrandConfig;
  orientation: 'landscape' | 'vertical' | 'square';
}

export function BackgroundLayer({ shotList, media, brand, orientation }: BackgroundLayerProps) {
  const { fps } = useVideoConfig();
  const frame   = useCurrentFrame();
  const seconds = frame / fps;

  const navy      = brand.navy      ?? DEFAULT_BRAND.navy;
  const navyLight = brand.navyLight ?? DEFAULT_BRAND.navyLight;

  // determine which shot is active
  const activeShot = shotList.find(
    (s) => seconds >= s.start && seconds < s.end,
  ) ?? shotList[0];

  // find a media item for this shot
  const activeMedia = activeShot
    ? media.find(
        (m) => m.shotIndex === activeShot.index ||
               (m.startTime != null && seconds >= m.startTime && seconds < (m.endTime ?? Infinity)),
      )
    : null;

  const gradientStyle: React.CSSProperties = {
    background: `linear-gradient(135deg, ${navy} 0%, ${navyLight} 100%)`,
    width:  '100%',
    height: '100%',
    position: 'absolute',
    inset: 0,
  };

  if (!activeMedia?.path) {
    return <div style={gradientStyle} />;
  }

  const mediaStyle: React.CSSProperties = {
    position: 'absolute',
    inset:    0,
    width:    '100%',
    height:   '100%',
    objectFit: orientation === 'vertical' ? 'cover' : 'cover',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset:    0,
    background: `linear-gradient(to bottom, ${navy}99 0%, ${navy}cc 60%, ${navy}f0 100%)`,
  };

  return (
    <>
      {activeMedia.type === 'video' ? (
        <OffthreadVideo
          src={activeMedia.path}
          style={mediaStyle}
          muted
        />
      ) : (
        <Img
          src={activeMedia.path}
          style={mediaStyle}
        />
      )}
      <div style={overlayStyle} />
    </>
  );
}

// ---- IntroBumper -----------------------------------------------

interface IntroBumperProps {
  brand:       BrandConfig;
  orientation: 'landscape' | 'vertical' | 'square';
}

export function IntroBumper({ brand, orientation }: IntroBumperProps) {
  const { fps } = useVideoConfig();
  const frame   = useCurrentFrame();

  const gold  = brand.gold  ?? DEFAULT_BRAND.gold;
  const white = brand.white ?? DEFAULT_BRAND.white;
  const name  = brand.name  ?? DEFAULT_BRAND.name;

  // logo scale spring
  const scale = spring({
    fps,
    frame,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
    from:   0.3,
    to:     1,
  });

  // title slide-up
  const translateY = interpolate(frame, [0, 20], [60, 0], {
    extrapolateRight: 'clamp',
  });

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const isVertical = orientation === 'vertical';
  const logoSize   = isVertical ? 64 : 48;
  const titleSize  = isVertical ? 52 : 40;
  const subSize    = isVertical ? 24 : 18;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems:     'center',
        flexDirection:  'column',
        gap:            16,
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          transform:  `scale(${scale})`,
          opacity,
          display:    'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap:        12,
        }}
      >
        {/* Gold bracket logo */}
        <div
          style={{
            width:  logoSize * 1.5,
            height: logoSize * 1.5,
            border: `4px solid ${gold}`,
            borderRadius: 12,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(212,175,55,0.12)',
          }}
        >
          <span
            style={{
              color:      gold,
              fontSize:   logoSize * 0.7,
              fontWeight: 900,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '-2px',
            }}
          >
            S
          </span>
        </div>

        {/* Studio name */}
        <div
          style={{
            transform:  `translateY(${translateY}px)`,
            textAlign:  'center',
          }}
        >
          <div
            style={{
              color:       white,
              fontSize:    titleSize,
              fontWeight:  900,
              fontFamily:  'system-ui, -apple-system, sans-serif',
              letterSpacing: 4,
              textTransform: 'uppercase',
            }}
          >
            {name}
          </div>
          <div
            style={{
              color:       gold,
              fontSize:    subSize,
              fontWeight:  500,
              fontFamily:  'system-ui, -apple-system, sans-serif',
              letterSpacing: 6,
              textTransform: 'uppercase',
              marginTop:   4,
            }}
          >
            Content Engine
          </div>
        </div>
      </div>

      {/* Gold divider bar */}
      <div
        style={{
          width:  interpolate(frame, [10, 30], [0, isVertical ? 400 : 320], { extrapolateRight: 'clamp' }),
          height: 3,
          backgroundColor: gold,
          borderRadius:    2,
        }}
      />
    </AbsoluteFill>
  );
}

// ---- OutroBumper -----------------------------------------------

interface OutroBumperProps {
  brand:       BrandConfig;
  orientation: 'landscape' | 'vertical' | 'square';
  totalFrames: number;
}

export function OutroBumper({ brand, orientation, totalFrames }: OutroBumperProps) {
  const { fps } = useVideoConfig();
  const frame   = useCurrentFrame();

  const gold  = brand.gold  ?? DEFAULT_BRAND.gold;
  const white = brand.white ?? DEFAULT_BRAND.white;
  const name  = brand.name  ?? DEFAULT_BRAND.name;

  const outro_start = totalFrames - fps * 3;
  const local_frame = frame - outro_start;

  const opacity = interpolate(local_frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft:  'clamp',
  });

  const scale = spring({
    fps,
    frame: Math.max(0, local_frame),
    config: { damping: 12, stiffness: 100 },
    from:   0.85,
    to:     1,
  });

  const isVertical = orientation === 'vertical';
  const titleSize  = isVertical ? 44 : 34;
  const subSize    = isVertical ? 22 : 17;
  const ctaSize    = isVertical ? 28 : 22;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems:     'center',
        flexDirection:  'column',
        gap:            20,
        opacity,
        transform:      `scale(${scale})`,
      }}
    >
      {/* CTA text */}
      <div
        style={{
          textAlign:  'center',
          padding:    '0 40px',
        }}
      >
        <div
          style={{
            color:       gold,
            fontSize:    ctaSize,
            fontWeight:  800,
            fontFamily:  'system-ui, -apple-system, sans-serif',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Comment &ldquo;STACKD&rdquo;
        </div>
        <div
          style={{
            color:       white,
            fontSize:    subSize,
            fontWeight:  400,
            fontFamily:  'system-ui, -apple-system, sans-serif',
            opacity:     0.85,
            lineHeight:  1.5,
          }}
        >
          to get the full blueprint
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 200, height: 2, backgroundColor: gold, borderRadius: 2 }} />

      {/* Brand name footer */}
      <div
        style={{
          color:       white,
          fontSize:    titleSize * 0.45,
          fontWeight:  600,
          fontFamily:  'system-ui, -apple-system, sans-serif',
          letterSpacing: 4,
          textTransform: 'uppercase',
          opacity:     0.7,
        }}
      >
        {name}
      </div>
    </AbsoluteFill>
  );
}

// ---- Captions --------------------------------------------------

interface CaptionsProps {
  wordTimestamps: WordTimestamp[];
  orientation:    'landscape' | 'vertical' | 'square';
  brand:          BrandConfig;
}

export function Captions({ wordTimestamps, orientation, brand }: CaptionsProps) {
  const { fps } = useVideoConfig();
  const frame   = useCurrentFrame();
  const seconds = frame / fps;

  const gold  = brand.gold  ?? DEFAULT_BRAND.gold;
  const white = brand.white ?? DEFAULT_BRAND.white;

  if (!wordTimestamps || wordTimestamps.length === 0) return null;

  // show a window of words around the current time
  const WINDOW = 5;
  const currentIdx = wordTimestamps.findIndex(
    (w) => seconds >= w.start && seconds <= w.end,
  );
  const anchorIdx = currentIdx >= 0 ? currentIdx : wordTimestamps.findIndex((w) => w.start > seconds) - 1;
  const start     = Math.max(0, anchorIdx - 2);
  const slice     = wordTimestamps.slice(start, start + WINDOW);

  const isVertical = orientation === 'vertical';
  const fontSize   = isVertical ? 38 : 30;
  const bottom     = isVertical ? 220 : 80;

  return (
    <div
      style={{
        position:       'absolute',
        bottom,
        left:           0,
        right:          0,
        display:        'flex',
        flexWrap:       'wrap',
        justifyContent: 'center',
        alignItems:     'center',
        gap:            6,
        padding:        '0 60px',
      }}
    >
      {slice.map((w, i) => {
        const globalIdx   = start + i;
        const isActive    = globalIdx === currentIdx;
        const isPast      = w.end < seconds;

        return (
          <span
            key={`${w.word}-${globalIdx}`}
            style={{
              fontSize,
              fontWeight:       isActive ? 900 : 700,
              fontFamily:       'system-ui, -apple-system, sans-serif',
              color:            isActive ? gold : (isPast ? `${white}99` : white),
              textShadow:       '0 2px 8px rgba(0,0,0,0.8)',
              textTransform:    isActive ? 'uppercase' : 'none',
              transition:       'color 0.1s',
              transform:        isActive ? 'scale(1.08)' : 'scale(1)',
              display:          'inline-block',
              letterSpacing:    isActive ? 1 : 0,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
}

// ---- Branding (persistent overlay) ----------------------------

interface BrandingProps {
  brand:       BrandConfig;
  orientation: 'landscape' | 'vertical' | 'square';
}

export function Branding({ brand, orientation }: BrandingProps) {
  const gold  = brand.gold  ?? DEFAULT_BRAND.gold;
  const white = brand.white ?? DEFAULT_BRAND.white;
  const name  = brand.name  ?? DEFAULT_BRAND.name;

  const isVertical = orientation === 'vertical';
  const logoSize   = isVertical ? 36 : 28;
  const fontSize   = isVertical ? 18 : 14;

  return (
    <>
      {/* Top-left logo badge */}
      <div
        style={{
          position:        'absolute',
          top:             20,
          left:            20,
          display:         'flex',
          alignItems:      'center',
          gap:             8,
          backgroundColor: 'rgba(10,26,53,0.75)',
          borderRadius:    8,
          padding:         '6px 12px',
          border:          `1px solid ${gold}44`,
        }}
      >
        <div
          style={{
            width:           logoSize,
            height:          logoSize,
            border:          `2px solid ${gold}`,
            borderRadius:    4,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}
        >
          <span
            style={{
              color:      gold,
              fontSize:   logoSize * 0.6,
              fontWeight: 900,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            S
          </span>
        </div>
        <span
          style={{
            color:       white,
            fontSize:    fontSize,
            fontWeight:  700,
            fontFamily:  'system-ui, -apple-system, sans-serif',
            letterSpacing: 1,
          }}
        >
          {name}
        </span>
      </div>

      {/* Gold lower-third bar */}
      <div
        style={{
          position:        'absolute',
          bottom:          0,
          left:            0,
          right:           0,
          height:          4,
          backgroundColor: gold,
        }}
      />
    </>
  );
}

// ---- AnimationBullets ------------------------------------------

interface AnimationBulletsProps {
  bullets:     string[];
  brand:       BrandConfig;
  orientation: 'landscape' | 'vertical' | 'square';
  localFrame:  number;
}

export function AnimationBullets({ bullets, brand, orientation, localFrame }: AnimationBulletsProps) {
  const { fps } = useVideoConfig();

  const gold  = brand.gold  ?? DEFAULT_BRAND.gold;
  const white = brand.white ?? DEFAULT_BRAND.white;

  const isVertical = orientation === 'vertical';
  const fontSize   = isVertical ? 30 : 24;

  return (
    <div
      style={{
        position: 'absolute',
        left:     isVertical ? 40 : 60,
        top:      isVertical ? '35%' : '30%',
        display:  'flex',
        flexDirection: 'column',
        gap:      12,
      }}
    >
      {bullets.map((bullet, i) => {
        const reveal_frame = i * 12;
        const opacity = interpolate(
          localFrame,
          [reveal_frame, reveal_frame + 10],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const tx = interpolate(
          localFrame,
          [reveal_frame, reveal_frame + 10],
          [-30, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        return (
          <div
            key={i}
            style={{
              opacity,
              transform:      `translateX(${tx}px)`,
              display:        'flex',
              alignItems:     'center',
              gap:            10,
            }}
          >
            <div
              style={{
                width:           8,
                height:          8,
                borderRadius:    '50%',
                backgroundColor: gold,
                flexShrink:      0,
              }}
            />
            <span
              style={{
                color:       white,
                fontSize:    fontSize,
                fontWeight:  700,
                fontFamily:  'system-ui, -apple-system, sans-serif',
                textShadow:  '0 2px 8px rgba(0,0,0,0.9)',
              }}
            >
              {bullet}
            </span>
          </div>
        );
      })}
    </div>
  );
}
