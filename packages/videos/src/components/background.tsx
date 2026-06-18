import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { COLORS } from "../theme";
import type { Theme } from "../theme";

// Background texture over a solid base, with a slow zoom and a soft vignette.
// The treatment (image, opacity, wash) comes from the theme, so the same
// component serves the dark launch video and the light embeddings video.
export const Background = ({ theme = COLORS }: { theme?: Theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      <Img
        src={staticFile(theme.backgroundImage)}
        style={{
          height: "100%",
          objectFit: "cover",
          opacity: theme.backgroundImageOpacity,
          transform: `scale(${scale})`,
          translate: "-16.4px 4.8px",
          width: "100%",
        }}
      />
      <AbsoluteFill style={{ background: theme.vignette }} />
    </AbsoluteFill>
  );
};
