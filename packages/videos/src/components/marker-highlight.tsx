import type { ReactNode } from "react";
import {
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { COLORS } from "../theme";

interface MarkerHighlightProps {
  children: ReactNode;
  delay?: number;
  markerColor?: string;
  baseColor?: string;
  highlightedTextColor?: string;
}

// Inline highlighter-pen sweep behind a phrase. Uses an animated background fill
// with `box-decoration-break: clone` so it wraps correctly across multiple lines
// (each line gets its own rounded highlight) instead of one giant rectangle.
export const MarkerHighlight = ({
  children,
  delay = 0,
  markerColor = COLORS.marker,
  baseColor = COLORS.foreground,
  highlightedTextColor = COLORS.markerText,
}: MarkerHighlightProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    config: { damping: 14 },
    fps,
    frame: frame - delay,
  });
  const fill = interpolate(progress, [0, 1], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textColor = interpolateColors(
    interpolate(progress, [0.45, 0.75], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    [0, 1],
    [baseColor, highlightedTextColor]
  );

  return (
    <span
      style={{
        WebkitBoxDecorationBreak: "clone",
        backgroundImage: `linear-gradient(${markerColor}, ${markerColor})`,
        backgroundPosition: "0 center",
        backgroundRepeat: "no-repeat",
        backgroundSize: `${fill}% 100%`,
        borderRadius: "0.1em",
        boxDecorationBreak: "clone",
        color: textColor,
        padding: "0.08em 0.12em",
      }}
    >
      {children}
    </span>
  );
};
