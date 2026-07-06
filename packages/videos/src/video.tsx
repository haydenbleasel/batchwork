import { AbsoluteFill, Series } from "remotion";

import { Background } from "./components/background";
import { Scene } from "./components/scene";
import { AiSdk } from "./scenes/ai-sdk";
import { Intro } from "./scenes/intro";
import { NextScene } from "./scenes/next-scene";
import { Outro } from "./scenes/outro";
import { Server } from "./scenes/server";
import { UnifiedApi } from "./scenes/unified-api";
import { COLORS } from "./theme";

// Each sequence gets +1s (30 frames) of hold so completed code is readable.
const SCENES = [
  { Component: Intro, durationInFrames: 125 },
  { Component: UnifiedApi, durationInFrames: 205 },
  { Component: AiSdk, durationInFrames: 205 },
  { Component: Server, durationInFrames: 215 },
  { Component: NextScene, durationInFrames: 205 },
  { Component: Outro, durationInFrames: 180 },
] as const;

// oxlint-disable-next-line react-doctor/only-export-components -- the Remotion Root reads the duration alongside the composition.
export const TOTAL_DURATION = SCENES.reduce(
  (sum, scene) => sum + scene.durationInFrames,
  0
);

export const BatchworkLaunch = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
    <Background />
    <Series>
      {SCENES.map(({ Component, durationInFrames }, i) => (
        <Series.Sequence
          durationInFrames={durationInFrames}
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- scene order is fixed.
          key={i}
        >
          <Scene durationInFrames={durationInFrames}>
            <Component />
          </Scene>
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
