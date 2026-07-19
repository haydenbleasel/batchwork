import { AbsoluteFill, useCurrentFrame } from "remotion";

import { InstallPill } from "../../components/install-pill";
import { PROVIDERS } from "../../components/logos";
import { ProviderRow } from "../../components/provider-row";
import { fadeUp } from "../../lib/animation";
import { SANS } from "../../lib/fonts";
import { LIGHT } from "../../theme";

const HEADLINE = 104;

// The five providers gaining a new modality in 1.3 (OpenAI centered in the
// ring): Groq + Mistral + Together (audio), OpenAI + Mistral (moderation),
// xAI (video), OpenAI + xAI (image edits).
const RELEASE_PROVIDERS = [
  PROVIDERS[5],
  PROVIDERS[3],
  PROVIDERS[0],
  PROVIDERS[4],
  PROVIDERS[6],
] as const;

export const Release13Intro = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        gap: 46,
        justifyContent: "center",
        padding: "80px 120px",
      }}
    >
      <h1
        style={{
          color: LIGHT.foreground,
          fontFamily: SANS,
          fontSize: HEADLINE,
          fontWeight: 500,
          letterSpacing: "-0.045em",
          lineHeight: 1.06,
          margin: 0,
          textAlign: "center",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "0.26em",
            justifyContent: "center",
          }}
        >
          {["Four", "new", "ways", "to"].map((word, i) => (
            <span key={word} style={fadeUp(frame, 4 + i * 3, { distance: 18 })}>
              {word}
            </span>
          ))}
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 32,
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", gap: "0.26em" }}>
            {["save", "on"].map((word, i) => (
              <span
                key={word}
                style={fadeUp(frame, 16 + i * 3, { distance: 18 })}
              >
                {word}
              </span>
            ))}
          </div>
          <span
            style={{ display: "inline-flex", transform: "translateY(4px)" }}
          >
            <ProviderRow
              overlap={14}
              providers={RELEASE_PROVIDERS}
              ringColor="#ffffff"
              size={84}
              startDelay={22}
            />
          </span>
          <span style={fadeUp(frame, 25, { distance: 18 })}>costs</span>
        </div>
      </h1>

      <p
        style={{
          color: LIGHT.muted,
          fontFamily: SANS,
          fontSize: 29,
          lineHeight: 1.55,
          margin: 0,
          maxWidth: 1180,
          textAlign: "center",
          textWrap: "balance",
          ...fadeUp(frame, 30),
        }}
      >
        Audio transcription and translation, content moderation, video
        generation, and image editing — same job handle, batch pricing
        everywhere.
      </p>

      <InstallPill delay={38} showCopy={false} theme={LIGHT} />
    </AbsoluteFill>
  );
};
