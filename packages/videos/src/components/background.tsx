import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { COLORS } from "../theme";

// Subtle, desaturated background texture over a near-black base, with a slow
// zoom and a soft vignette.
export const Background = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.16], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <Img
        src={staticFile("background.jpg")}
        style={{
          height: "100%",
          objectFit: "cover",
          opacity: 0.1,
          transform: `scale(${scale})`,
          width: "100%",
        }}
        from={-19}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(130% 130% at 50% 40%, rgba(3,12,10,0) 38%, rgba(2,8,7,0.5) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
