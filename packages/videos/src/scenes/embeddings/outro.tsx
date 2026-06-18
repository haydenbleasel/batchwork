import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { InstallPill } from "../../components/install-pill";
import { ProviderRow } from "../../components/provider-row";
import { fadeUp } from "../../lib/animation";
import { SANS } from "../../lib/fonts";
import { LIGHT } from "../../theme";

// Light-mode twin of the launch outro: provider ring, wordmark, install pill.
export const EmbeddingsOutro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    config: { damping: 200, mass: 0.6 },
    durationInFrames: 26,
    fps,
    frame: frame - 12,
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        gap: 40,
        justifyContent: "center",
        padding: "80px 120px",
      }}
    >
      <ProviderRow overlap={14} ringColor="#ffffff" size={78} startDelay={6} />

      <h1
        style={{
          color: LIGHT.foreground,
          fontFamily: SANS,
          fontSize: 138,
          fontWeight: 580,
          letterSpacing: "-0.05em",
          margin: 0,
          opacity: pop,
          transform: `translateY(${(1 - pop) * 18}px)`,
        }}
      >
        batchwork
      </h1>

      <p
        style={{
          color: LIGHT.muted,
          fontFamily: SANS,
          fontSize: 31,
          letterSpacing: "-0.01em",
          margin: 0,
          ...fadeUp(frame, 26),
        }}
      >
        Unified batch API for AI providers.
      </p>

      <div style={{ marginTop: 6 }}>
        <InstallPill delay={34} showCopy={false} theme={LIGHT} />
      </div>
    </AbsoluteFill>
  );
};
