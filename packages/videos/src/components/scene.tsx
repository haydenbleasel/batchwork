import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { fadeInOut } from "../lib/animation";

interface SceneProps {
  durationInFrames: number;
  children: ReactNode;
  edge?: number;
}

// Wraps a scene so it fades in from — and out to — the persistent background,
// giving a clean dip between scenes instead of an overlapping crossfade.
export const Scene = ({
  durationInFrames,
  children,
  edge = 13,
}: SceneProps) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: fadeInOut(frame, durationInFrames, edge) }}>
      {children}
    </AbsoluteFill>
  );
};
