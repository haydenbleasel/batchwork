import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { PROVIDERS } from "./logos";

type Provider = (typeof PROVIDERS)[number];

interface ProviderRowProps {
  size?: number;
  overlap?: number;
  ring?: number;
  ringColor?: string;
  startDelay?: number;
  // Subset / ordering of tiles to show (defaults to every provider).
  providers?: readonly Provider[];
}

// Overlapping ring of brand-colored provider tiles that pop in from the centre
// outward — the hero's signature motif. The ring color separates the tiles, so
// pass a dark ring on dark backgrounds and a white ring on light ones.
export const ProviderRow = ({
  size = 104,
  overlap = 16,
  ring = 6,
  ringColor = "#0a1412",
  startDelay = 12,
  providers = PROVIDERS,
}: ProviderRowProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const center = (providers.length - 1) / 2;

  return (
    <div style={{ display: "inline-flex" }}>
      {providers.map(({ Icon, name }, i) => {
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
              zIndex: providers.length - Math.round(order),
            }}
          >
            <Icon style={{ display: "block", height: "100%", width: "100%" }} />
          </div>
        );
      })}
    </div>
  );
};
