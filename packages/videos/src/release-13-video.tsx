import { AbsoluteFill, Series } from "remotion";

import { Background } from "./components/background";
import { Scene } from "./components/scene";
import { Release13Audio } from "./scenes/release-13/audio";
import { Release13ImageEdits } from "./scenes/release-13/image-edits";
import { Release13Intro } from "./scenes/release-13/intro";
import { Release13Moderation } from "./scenes/release-13/moderation";
import { Release13Outro } from "./scenes/release-13/outro";
import { Release13Video } from "./scenes/release-13/video-gen";
import { LIGHT } from "./theme";

// Light-mode release video for Batchwork 1.3, in the feature-video style:
// intro → one code + terminal demo per new modality (audio, moderation, video,
// image edits) → standard batchwork outro.
const SCENES = [
  { Component: Release13Intro, durationInFrames: 120 },
  { Component: Release13Audio, durationInFrames: 300 },
  { Component: Release13Moderation, durationInFrames: 300 },
  { Component: Release13Video, durationInFrames: 300 },
  { Component: Release13ImageEdits, durationInFrames: 300 },
  { Component: Release13Outro, durationInFrames: 180 },
] as const;

// oxlint-disable-next-line react-doctor/only-export-components -- the Remotion Root reads the duration alongside the composition.
export const RELEASE_13_DURATION = SCENES.reduce(
  (sum, scene) => sum + scene.durationInFrames,
  0
);

export const BatchworkRelease13 = () => (
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
