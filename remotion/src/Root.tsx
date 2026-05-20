import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './Video';
import type { VideoProps } from './Video';

// ---- safe preview defaults ------------------------------------------

const SAMPLE_STRATEGY = {
  videoId:         'preview',
  title:           'AI Automation for Entrepreneurs',
  recommendedHook: 'What if your business ran itself overnight?',
  script:          'AI automation is changing the game for small business owners. Here is how you can build systems that work while you sleep.',
  shotList: [
    {
      index:            0,
      start:            0,
      end:              5,
      visual:           'Person working at a laptop in a modern office',
      brollQuery:       'entrepreneur laptop office',
      animationBullets: ['Save 10+ hours/week', 'Automate the boring stuff'],
    },
    {
      index:            1,
      start:            5,
      end:              12,
      visual:           'Dashboard with charts and metrics',
      brollQuery:       'business dashboard analytics',
      animationBullets: ['Real-time insights', '24/7 monitoring'],
    },
    {
      index:            2,
      start:            12,
      end:              20,
      visual:           'Phone showing notification with happy reaction',
      brollQuery:       'phone notification success',
      animationBullets: ['Instant alerts', 'Never miss a lead'],
    },
  ],
  durationSeconds: 30,
  captions:        [],
};

const SAMPLE_WORD_TIMESTAMPS = [
  { word: 'AI',           start: 0.0,  end: 0.3  },
  { word: 'automation',   start: 0.4,  end: 1.0  },
  { word: 'is',           start: 1.1,  end: 1.3  },
  { word: 'changing',     start: 1.4,  end: 1.9  },
  { word: 'the',          start: 2.0,  end: 2.2  },
  { word: 'game',         start: 2.3,  end: 2.7  },
  { word: 'for',          start: 2.8,  end: 3.0  },
  { word: 'small',        start: 3.1,  end: 3.5  },
  { word: 'business',     start: 3.6,  end: 4.1  },
  { word: 'owners.',      start: 4.2,  end: 4.8  },
];

function makeDefaultProps(orientation: 'landscape' | 'vertical' | 'square'): VideoProps {
  return {
    strategy:       SAMPLE_STRATEGY,
    audioSrc:       '',
    wordTimestamps: SAMPLE_WORD_TIMESTAMPS,
    media:          [],
    musicSrc:       null,
    brand:          {},
    orientation,
  };
}

// ---- root -----------------------------------------------------------

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="landscape"
        component={VideoComposition}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={1500}
        defaultProps={makeDefaultProps('landscape')}
      />
      <Composition
        id="vertical"
        component={VideoComposition}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={1500}
        defaultProps={makeDefaultProps('vertical')}
      />
      <Composition
        id="square"
        component={VideoComposition}
        width={1080}
        height={1080}
        fps={30}
        durationInFrames={1500}
        defaultProps={makeDefaultProps('square')}
      />
    </>
  );
}
