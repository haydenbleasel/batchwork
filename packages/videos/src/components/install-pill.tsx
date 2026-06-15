import { useCurrentFrame } from "remotion";

import { fadeUp } from "../lib/animation";
import { MONO } from "../lib/fonts";
import { COLORS } from "../theme";

// lucide-react "copy" icon, matching apps/web InstallCommand.
const CopyIcon = () => (
  <svg
    fill="none"
    height="26"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="26"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>Copy</title>
    <rect height="14" rx="2" ry="2" width="14" x="8" y="8" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

export const InstallPill = ({ delay = 0 }: { delay?: number }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255,255,255,0.07)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 999,
        color: COLORS.foreground,
        display: "inline-flex",
        fontFamily: MONO,
        fontSize: 28,
        gap: 18,
        padding: "24px 42px",
        ...fadeUp(frame, delay),
      }}
    >
      <span style={{ color: COLORS.faint }}>$</span>
      <span>npm install batchwork</span>
      <span
        style={{ color: COLORS.muted, display: "inline-flex", marginLeft: 8 }}
      >
        <CopyIcon />
      </span>
    </div>
  );
};
