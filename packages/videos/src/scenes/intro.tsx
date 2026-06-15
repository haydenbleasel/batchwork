import { AbsoluteFill, useCurrentFrame } from "remotion";

import { InstallPill } from "../components/install-pill";
import { MarkerHighlight } from "../components/marker-highlight";
import { ProviderRow } from "../components/provider-row";
import { fadeUp } from "../lib/animation";
import { SANS } from "../lib/fonts";
import { COLORS } from "../theme";

const HEADLINE = 116;

export const Intro = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        gap: 52,
        justifyContent: "center",
        padding: "80px 120px",
      }}
    >
      <h1
        style={{
          color: COLORS.foreground,
          fontFamily: SANS,
          fontSize: HEADLINE,
          fontWeight: 500,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          margin: 0,
          textAlign: "center",
        }}
      >
        <div style={fadeUp(frame, 4, { distance: 18 })}>
          Save up to{" "}
          <MarkerHighlight delay={26} markerColor={COLORS.syntax.string}>
            50%
          </MarkerHighlight>{" "}
          on
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 40,
            justifyContent: "center",
          }}
        >
          <span
            style={{ display: "inline-flex", transform: "translateY(6px)" }}
          >
            <ProviderRow size={104} />
          </span>
          <span style={fadeUp(frame, 20)}>costs</span>
        </div>
      </h1>

      <p
        style={{
          color: COLORS.muted,
          fontFamily: SANS,
          fontSize: 30,
          lineHeight: 1.55,
          margin: 0,
          maxWidth: 980,
          textAlign: "center",
          textWrap: "balance",
          ...fadeUp(frame, 32),
        }}
      >
        Unified batch API for AI providers. Process LLM requests in bulk with a
        single call for lower costs. Processing, uploading, polling, and result
        parsing handled for you.
      </p>

      <InstallPill delay={42} />
    </AbsoluteFill>
  );
};
