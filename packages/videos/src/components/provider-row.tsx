import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { PROVIDERS } from "./logos";

interface ProviderRowProps {
  size?: number;
  overlap?: number;
  ring?: number;
  ringColor?: string;
  startDelay?: number;
}

// Overlapping ring of brand-colored provider tiles that pop in from the centre
// outward — the hero's signature motif. On the dark background the ring is a
// dark separator (rather than white) so it reads as a gap between tiles.
export const ProviderRow = ({
  size = 104,
  overlap = 16,
  ring = 6,
  ringColor = "#0a1412",
  startDelay = 12,
}: ProviderRowProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const center = (PROVIDERS.length - 1) / 2;

  return (
    <div style={{ display: "inline-flex" }}>
      {PROVIDERS.map(({ Icon, name }, i) => {
        const order = Math.abs(i - center);
        const pop = spring({
          config: { damping: 14, mass: 0.6 },
          fps,
          frame: frame - (startDelay + order * 3),
        });
        return (
          <div
            key={name}
            style={{
              borderRadius: 999,
              boxShadow: `0 0 0 ${ring}px ${ringColor}, 0 12px 32px -10px rgba(0,0,0,0.5)`,
              height: size,
              marginLeft: i === 0 ? 0 : -overlap,
              opacity: interpolate(pop, [0, 1], [0, 1]),
              overflow: "hidden",
              transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])})`,
              width: size,
              zIndex: PROVIDERS.length - Math.round(order),
            }}
          >
            <Icon style={{ display: "block", height: "100%", width: "100%" }} />
          </div>
        );
      })}
    </div>
  );
};
