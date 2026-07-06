import { AbsoluteFill, Series } from "remotion";

import { Background } from "./components/background";
import { Scene } from "./components/scene";
import { EmbeddingsDemo } from "./scenes/embeddings/demo";
import { EmbeddingsIntro } from "./scenes/embeddings/intro";
import { EmbeddingsOutro } from "./scenes/embeddings/outro";
import { LIGHT } from "./theme";

// Light-mode video for the batch embeddings feature: intro → end-to-end demo
// (code + terminal) → standard batchwork outro.
const SCENES = [
  { Component: EmbeddingsIntro, durationInFrames: 120 },
  { Component: EmbeddingsDemo, durationInFrames: 345 },
  { Component: EmbeddingsOutro, durationInFrames: 180 },
] as const;

// oxlint-disable-next-line react-doctor/only-export-components -- the Remotion Root reads the duration alongside the composition.
export const EMBEDDINGS_DURATION = SCENES.reduce(
  (sum, scene) => sum + scene.durationInFrames,
  0
);

export const BatchworkEmbeddings = () => (
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
