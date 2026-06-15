import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { MONO } from "../lib/fonts";
import type { Token } from "../lib/highlight";
import { TOKEN_COLOR, tokenizeLine } from "../lib/highlight";
import { COLORS } from "../theme";

interface GlassCodeBlockProps {
  code: string;
  title: string;
  width?: number;
  height?: number;
  fontSize?: number;
  /** Frame at which the block enters and typing begins. */
  delay?: number;
  /** Frames over which the entire snippet is typed out. */
  typeFrames?: number;
}

const TrafficLight = ({ color }: { color: string }) => (
  <div
    style={{
      background: color,
      borderRadius: "50%",
      height: 13,
      opacity: 0.92,
      width: 13,
    }}
  />
);

// Reveal a line's tokens up to `budget` characters (stable colors as it types).
const sliceTokens = (line: string, budget: number): Token[] => {
  const tokens = tokenizeLine(line);
  if (budget >= line.length) {
    return tokens;
  }
  const out: Token[] = [];
  let remaining = budget;
  for (const token of tokens) {
    if (remaining <= 0) {
      break;
    }
    if (token.text.length <= remaining) {
      out.push(token);
      remaining -= token.text.length;
    } else {
      out.push({ text: token.text.slice(0, remaining), type: token.type });
      remaining = 0;
    }
  }
  return out;
};

// Frosted-glass editor window (ported from the remocn glass-code-block) whose
// body types itself out character-by-character with syntax highlighting.
export const GlassCodeBlock = ({
  code,
  title,
  width = 1120,
  height = 580,
  fontSize = 23,
  delay = 0,
  typeFrames = 120,
}: GlassCodeBlockProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 28,
    fps,
    frame: frame - delay,
  });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const ty = interpolate(enter, [0, 1], [26, 0]);
  const scale = interpolate(enter, [0, 1], [0.97, 1]);

  const lines = code.split("\n");
  const typeStart = delay + 8;
  const revealed = Math.floor(
    interpolate(frame, [typeStart, typeStart + typeFrames], [0, code.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );

  // Per-line start offsets (each line plus its trailing newline).
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  let activeLine = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (revealed > (starts[i] ?? 0)) {
      activeLine = i;
    }
  }

  const cursorOn = Math.floor((frame / fps) * 2) % 2 === 0;
  const lineH = Math.round(fontSize * 1.62);

  return (
    <div
      style={{
        opacity,
        position: "relative",
        transform: `translateY(${ty}px) scale(${scale})`,
        width,
      }}
    >
      <div
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0) 100%)",
          borderRadius: 18,
          boxShadow: "0 50px 120px rgba(0,0,0,0.55)",
          height,
          padding: 1,
          position: "relative",
        }}
      >
        <div
          style={{
            // Translucent panel rather than a real backdrop blur — backdrop-filter
            // can't be opacity-faded (it snaps off below 100%), so we fake the
            // frosted look with a dark glass gradient + sheen that fade cleanly.
            background:
              "linear-gradient(155deg, rgba(22,30,28,0.74) 0%, rgba(9,15,13,0.82) 100%)",
            borderRadius: 17,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            fontFamily: MONO,
            height: "100%",
            overflow: "hidden",
            position: "relative",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexShrink: 0,
              gap: 9,
              height: 48,
              padding: "0 20px",
            }}
          >
            <TrafficLight color="#ff5f57" />
            <TrafficLight color="#febc2e" />
            <TrafficLight color="#28c840" />
            <div
              style={{
                color: COLORS.muted,
                flex: 1,
                fontSize: 16,
                letterSpacing: "0.02em",
                textAlign: "center",
              }}
            >
              {title}
            </div>
            <div style={{ flexShrink: 0, width: 54 }} />
          </div>

          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              fontSize,
              lineHeight: `${lineH}px`,
              padding: "24px 28px",
            }}
          >
            {lines.map((line, i) => {
              if (i > activeLine) {
                return null;
              }
              const budget = Math.max(
                0,
                Math.min(line.length, revealed - (starts[i] ?? 0))
              );
              const tokens = sliceTokens(line, budget);
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: code lines are static and ordered
                  key={i}
                  style={{ display: "flex", height: lineH, whiteSpace: "pre" }}
                >
                  <span
                    style={{
                      color: "#52525b",
                      flexShrink: 0,
                      marginRight: 22,
                      textAlign: "right",
                      width: 36,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span>
                    {tokens.map((token, j) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are static and ordered
                        key={j}
                        style={{ color: TOKEN_COLOR[token.type] }}
                      >
                        {token.text}
                      </span>
                    ))}
                    {i === activeLine && (
                      <span
                        style={{
                          background: COLORS.emerald,
                          display: "inline-block",
                          height: "1.05em",
                          marginLeft: 1,
                          opacity: cursorOn ? 1 : 0,
                          transform: "translateY(3px)",
                          width: "0.55ch",
                        }}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Glass sheen reflection. */}
          <div
            aria-hidden
            style={{
              background:
                "linear-gradient(125deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 34%)",
              borderRadius: 17,
              inset: 0,
              pointerEvents: "none",
              position: "absolute",
            }}
          />
        </div>
      </div>
    </div>
  );
};
