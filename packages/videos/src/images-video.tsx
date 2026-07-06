import { AbsoluteFill, Series } from "remotion";

import { Background } from "./components/background";
import { Scene } from "./components/scene";
import { ImagesDemo } from "./scenes/images/demo";
import { ImagesIntro } from "./scenes/images/intro";
import { ImagesOutro } from "./scenes/images/outro";
import { LIGHT } from "./theme";

// Light-mode video for the batch images feature: intro → end-to-end demo
// (code + terminal) → standard batchwork outro.
const SCENES = [
  { Component: ImagesIntro, durationInFrames: 120 },
  { Component: ImagesDemo, durationInFrames: 345 },
  { Component: ImagesOutro, durationInFrames: 180 },
] as const;

// oxlint-disable-next-line react-doctor/only-export-components -- the Remotion Root reads the duration alongside the composition.
export const IMAGES_DURATION = SCENES.reduce(
  (sum, scene) => sum + scene.durationInFrames,
  0
);

export const BatchworkImages = () => (
  <AbsoluteFill style={{ backgroundColor: LIGHT.background }}>
    <Background theme={LIGHT} />
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
