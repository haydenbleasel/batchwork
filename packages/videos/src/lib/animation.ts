import { interpolate } from "remotion";

import { EASE } from "../theme";

interface FadeUpOptions {
  distance?: number;
  duration?: number;
}

/** Fade + slide-up entrance, the site's default motion for headings and cards. */
export const fadeUp = (
  frame: number,
  start: number,
  { distance = 16, duration = 22 }: FadeUpOptions = {}
) => {
  const range: [number, number] = [start, start + duration];
  const clamp = {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  } as const;

  return {
    opacity: interpolate(frame, range, [0, 1], clamp),
    transform: `translateY(${interpolate(frame, range, [distance, 0], clamp)}px)`,
  };
};

/**
 * Scene opacity that eases in at the head and out at the tail, computed as two
 * independent fades so the easing isn't warped across the whole duration. Lets
 * one scene dip to the background before the next fades in (no muddy crossfade).
 */
export const fadeInOut = (
  frame: number,
  durationInFrames: number,
  edge = 12
) => {
  const fadeIn = interpolate(frame, [0, edge], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - edge, durationInFrames],
    [1, 0],
    { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return Math.min(fadeIn, fadeOut);
};
