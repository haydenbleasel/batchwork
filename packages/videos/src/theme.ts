import { Easing } from "remotion";

// Signature easing used across the batchwork site (see Hero / FadeIn).
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const VIDEO = {
  fps: 30,
  height: 1080,
  width: 1920,
} as const;

// Shared shape for a video's color theme. Both the dark launch palette and the
// light embeddings palette satisfy this, so themed components (Background,
// InstallPill, …) can take either without branching.
export interface Theme {
  accent: { blue: string; mint: string; peach: string; violet: string };
  background: string;
  // Texture rendered behind every scene, from /public.
  backgroundImage: string;
  backgroundImageOpacity: number;
  border: string;
  emerald: string;
  faint: string;
  foreground: string;
  glass: string;
  // Highlighter marker for titles + the ink color that reads on it.
  marker: string;
  markerText: string;
  muted: string;
  // Background fill for the `npm install` pill.
  pillBg: string;
  syntax: {
    comment: string;
    func: string;
    keyword: string;
    number: string;
    plain: string;
    property: string;
    punct: string;
    string: string;
    type: string;
  };
  // Radial wash layered over the texture to settle it behind the content.
  vignette: string;
}

// Dark theme, built around the teal/emerald background texture
// (public/background.jpg). Used by the BatchworkLaunch composition.
export const COLORS: Theme = {
  accent: {
    blue: "#60a5fa",
    mint: "#6ee7b7",
    peach: "#fbbf24",
    violet: "#c4b5fd",
  },
  background: "#06100e",
  backgroundImage: "background.jpg",
  backgroundImageOpacity: 0.1,
  border: "rgba(255, 255, 255, 0.14)",
  emerald: "#34d399",
  faint: "#7c8884",
  foreground: "#fafafa",
  glass: "rgba(8, 14, 13, 0.55)",
  marker: "#6ee7b7",
  markerText: "#0c1311",
  muted: "#b6c1bd",
  pillBg: "rgba(255,255,255,0.07)",
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
  vignette:
    "radial-gradient(130% 130% at 50% 40%, rgba(3,12,10,0) 38%, rgba(2,8,7,0.5) 100%)",
};

// Light theme, built around the warm pastel gradient (public/background-2.jpg).
// Used by the BatchworkEmbeddings composition. Syntax mirrors a clean light
// editor (purple keywords, blue functions, green strings) for the code card.
export const LIGHT: Theme = {
  accent: {
    blue: "#2563eb",
    mint: "#10b981",
    peach: "#f97316",
    violet: "#7c3aed",
  },
  background: "#f7f8fa",
  backgroundImage: "background-2.jpg",
  // The texture is already bright, so it sits at a low opacity over white and
  // is whitened further in the centre by the vignette below.
  backgroundImageOpacity: 0.42,
  // White, translucent border for the frosted install pill.
  border: "rgba(255, 255, 255, 0.55)",
  emerald: "#059669",
  // Black at 40% for the pill's $ prompt.
  faint: "rgba(0, 0, 0, 0.4)",
  foreground: "#0c1512",
  glass: "rgba(255,255,255,0.72)",
  marker: "#6ee7b7",
  markerText: "#0c1311",
  muted: "rgba(0, 0, 0, 0.7)",
  // Mostly see-through so the gradient reads through the pill.
  pillBg: "rgba(255,255,255,0.16)",
  // Light syntax theme for the code + terminal card.
  syntax: {
    comment: "#6e7781",
    func: "#0969da",
    keyword: "#8250df",
    number: "#b45309",
    plain: "#1f2328",
    property: "#1f2328",
    punct: "#57606a",
    string: "#1a7f37",
    type: "#0550ae",
  },
  vignette:
    "radial-gradient(120% 120% at 50% 38%, rgba(255,255,255,0.62) 26%, rgba(255,255,255,0) 78%)",
};
