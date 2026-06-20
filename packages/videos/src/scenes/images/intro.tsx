import { AbsoluteFill, useCurrentFrame } from "remotion";

import { InstallPill } from "../../components/install-pill";
import { PROVIDERS } from "../../components/logos";
import { ProviderRow } from "../../components/provider-row";
import { fadeUp } from "../../lib/animation";
import { SANS } from "../../lib/fonts";
import { LIGHT } from "../../theme";

const HEADLINE = 104;

// Only OpenAI, Gemini, and xAI expose a batch image-generation endpoint
// (OpenAI centered in the ring).
const IMAGE_PROVIDERS = [PROVIDERS[2], PROVIDERS[0], PROVIDERS[4]] as const;

export const ImagesIntro = () => {
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
          {["Generate", "images", "for"].map((word, i) => (
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
          <span
            style={{ display: "inline-flex", transform: "translateY(4px)" }}
          >
            <ProviderRow
              overlap={14}
              providers={IMAGE_PROVIDERS}
              ringColor="#ffffff"
              size={84}
              startDelay={13}
            />
          </span>
          <div style={{ display: "flex", gap: "0.26em" }}>
            {["up", "to", "50%", "cheaper"].map((word, i) => (
              <span
                key={word}
                style={fadeUp(frame, 16 + i * 3, { distance: 18 })}
              >
                {word}
              </span>
            ))}
          </div>
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
        Generate thousands of images in a single call — inline base64 or a
        hosted URL per request, correlated by customId. One job handle for
        OpenAI, Gemini, and xAI, billed at the batch rate.
      </p>

      <InstallPill delay={38} showCopy={false} theme={LIGHT} />
    </AbsoluteFill>
  );
};
