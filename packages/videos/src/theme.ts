import { Easing } from "remotion";

// Signature easing used across the batchwork site (see Hero / FadeIn).
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const VIDEO = {
  fps: 30,
  height: 1080,
  width: 1920,
} as const;

// Dark theme, built around the teal/emerald background texture (public/background.jpg).
export const COLORS = {
  accent: {
    blue: "#60a5fa",
    mint: "#6ee7b7",
    peach: "#fbbf24",
    violet: "#c4b5fd",
  },
  background: "#06100e",
  border: "rgba(255, 255, 255, 0.14)",
  emerald: "#34d399",
  faint: "#7c8884",
  foreground: "#fafafa",
  glass: "rgba(8, 14, 13, 0.55)",
  // Highlighter marker for titles. `markerText` is the dark ink that reads on
  // any of the (light) syntax colors used per scene.
  marker: "#6ee7b7",
  markerText: "#0c1311",
  muted: "#b6c1bd",
  // Dark syntax theme for the glass code block.
  syntax: {
    comment: "#6b7280",
    func: "#93c5fd",
    keyword: "#c4b5fd",
    number: "#fcd34d",
    plain: "#e4e4e7",
    property: "#d4d4d8",
    punct: "#a1a1aa",
    string: "#86efac",
    type: "#5eead4",
  },
} as const;
