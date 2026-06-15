import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

// Brand fonts — Geist (sans) and Geist Mono — matching apps/web/app/layout.tsx.
// Load only the weights/subset we use to keep renders fast.
export const { fontFamily: SANS } = loadGeist("normal", {
  ignoreTooManyRequestsWarning: true,
  subsets: ["latin"],
  weights: ["400", "500", "600", "700"],
});

export const { fontFamily: MONO } = loadGeistMono("normal", {
  ignoreTooManyRequestsWarning: true,
  subsets: ["latin"],
  weights: ["400", "500"],
});
