import { useCurrentFrame } from "remotion";

import { fadeUp } from "../lib/animation";
import { MONO } from "../lib/fonts";
import { COLORS } from "../theme";
import type { Theme } from "../theme";

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

export const InstallPill = ({
  delay = 0,
  theme = COLORS,
  showCopy = true,
}: {
  delay?: number;
  theme?: Theme;
  showCopy?: boolean;
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        alignItems: "center",
        background: theme.pillBg,
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        color: theme.foreground,
        display: "inline-flex",
        fontFamily: MONO,
        fontSize: 28,
        gap: 18,
        padding: "24px 42px",
        ...fadeUp(frame, delay),
      }}
    >
      <span style={{ color: theme.faint }}>$</span>
      <span>npm install batchwork</span>
      {showCopy && (
        <span
          style={{ color: theme.muted, display: "inline-flex", marginLeft: 8 }}
        >
          <CopyIcon />
        </span>
      )}
    </div>
  );
};
