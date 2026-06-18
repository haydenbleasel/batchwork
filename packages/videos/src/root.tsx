import { Composition } from "remotion";

import { BatchworkEmbeddings, EMBEDDINGS_DURATION } from "./embeddings-video";
import { VIDEO } from "./theme";
import { BatchworkLaunch, TOTAL_DURATION } from "./video";

export const RemotionRoot = () => (
  <>
    <Composition
      component={BatchworkLaunch}
      durationInFrames={TOTAL_DURATION}
      fps={VIDEO.fps}
      height={VIDEO.height}
      id="BatchworkLaunch"
      width={VIDEO.width}
    />
    <Composition
      component={BatchworkEmbeddings}
      durationInFrames={EMBEDDINGS_DURATION}
      fps={VIDEO.fps}
      height={VIDEO.height}
      id="BatchworkEmbeddings"
      width={VIDEO.width}
    />
  </>
);
