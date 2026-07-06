import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { MONO, SANS } from "../lib/fonts";
import type { Token } from "../lib/highlight";
import { tokenizeLine } from "../lib/highlight";
import { LIGHT } from "../theme";

interface CodeTerminalProps {
  code: string;
  /** Command typed into the terminal once the code finishes. */
  command: string;
  /** Info lines printed one-by-one right after the command. */
  output: string[];
  /** Final line shown after the spinner finishes (e.g. "✓ completed …"). */
  result?: string;
  /** Label beside the spinner while the batch "runs". */
  spinnerLabel?: string;
  /** Frames the spinner animates before the result appears (default 30 ≈ 1s). */
  spinnerFrames?: number;
  fileName?: string;
  terminalPath?: string;
  width?: number;
  fontSize?: number;
  /** Frame at which the card enters and code typing begins. */
  delay?: number;
  /** Frames over which the whole code snippet is typed out. */
  typeFrames?: number;
}

const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

// Braille spinner cycle, one glyph per ~3 frames.
const SPINNER_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

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

const Caret = ({ visible }: { visible: boolean }) => (
  <span
    style={{
      background: LIGHT.emerald,
      display: "inline-block",
      height: "1.05em",
      marginLeft: 1,
      opacity: visible ? 1 : 0,
      transform: "translateY(3px)",
      width: "0.55ch",
    }}
  />
);

interface TerminalPaneProps {
  /** Frame at which the command begins typing. */
  commandStart: number;
  command: string;
  output: string[];
  result?: string;
  spinnerLabel?: string;
  spinnerFrames: number;
  terminalPath: string;
  fontSize: number;
}

// Terminal section: the command types, info lines print, a spinner runs the
// "batch", then the result lands. The full line count is reserved up front so
// the card height never shifts as lines appear.
const TerminalPane = ({
  commandStart,
  command,
  output,
  result,
  spinnerLabel,
  spinnerFrames,
  terminalPath,
  fontSize,
}: TerminalPaneProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const blink = Math.floor((frame / fps) * 2) % 2 === 0;

  const cmdTypeFrames = 22;
  const cmdChars = Math.floor(
    interpolate(
      frame,
      [commandStart, commandStart + cmdTypeFrames],
      [0, command.length],
      CLAMP
    )
  );
  const outStart = commandStart + cmdTypeFrames + 10;
  const cmdCaretLive = frame >= commandStart && frame < outStart;

  const lastOutputAt = outStart + Math.max(0, output.length - 1) * 12;
  const spinnerStart = lastOutputAt + 16;
  const resultStart = spinnerStart + spinnerFrames;
  const spinning = frame >= spinnerStart && frame < resultStart;
  const spinnerGlyph =
    SPINNER_FRAMES[Math.floor(frame / 3) % SPINNER_FRAMES.length] ?? "⠋";
  const resultOpacity = interpolate(
    frame,
    [resultStart, resultStart + 10],
    [0, 1],
    CLAMP
  );
  const resultSuccess = result?.startsWith("✓") ?? false;

  const lineH = (fontSize - 2) * 1.75;
  const lineCount = 1 + output.length + (result ? 1 : 0);
  const bodyHeight = Math.round(lineCount * lineH) + 34;

  return (
    <>
      {/* Terminal header. */}
      <div
        style={{
          alignItems: "center",
          background: "rgba(250,250,251,0.92)",
          borderTop: "1px solid rgba(15,23,42,0.07)",
          display: "flex",
          height: 48,
          justifyContent: "space-between",
          padding: "0 30px",
        }}
      >
        <span
          style={{
            color: "#475467",
            fontFamily: SANS,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.01em",
          }}
        >
          Terminal
        </span>
        <span style={{ color: "#9aa3ad", fontFamily: MONO, fontSize: 16 }}>
          {terminalPath}
        </span>
      </div>

      {/* Terminal body. */}
      <div
        style={{
          background: "#fafbfc",
          fontSize: fontSize - 2,
          height: bodyHeight,
          lineHeight: 1.75,
          padding: "12px 30px 22px",
        }}
      >
        <div style={{ color: "#1f2328", whiteSpace: "pre" }}>
          <span style={{ color: LIGHT.emerald }}>$ </span>
          {command.slice(0, cmdChars)}
          {cmdCaretLive && <Caret visible={blink} />}
        </div>
        {output.map((ln, i) => {
          const at = outStart + i * 12;
          const o = interpolate(frame, [at, at + 10], [0, 1], CLAMP);
          return (
            <div
              // oxlint-disable-next-line react-doctor/no-array-index-as-key -- output lines are static and ordered.
              key={i}
              style={{ color: "#475467", opacity: o, whiteSpace: "pre" }}
            >
              {ln}
            </div>
          );
        })}
        {result && spinning && (
          <div style={{ color: "#475467", whiteSpace: "pre" }}>
            <span style={{ color: LIGHT.accent.blue }}>{spinnerGlyph}</span>{" "}
            {spinnerLabel}
          </div>
        )}
        {result && frame >= resultStart && (
          <div
            style={{
              color: resultSuccess ? LIGHT.emerald : "#475467",
              fontWeight: resultSuccess ? 500 : 400,
              opacity: resultOpacity,
              whiteSpace: "pre",
            }}
          >
            {result}
          </div>
        )}
      </div>
    </>
  );
};

// Light editor card with a code pane above a terminal pane — the code types
// itself out, then a command runs and its output prints. Every line slot is
// rendered up front so the card height stays fixed as the code streams in.
export const CodeTerminal = ({
  code,
  command,
  output,
  result,
  spinnerLabel,
  spinnerFrames = 30,
  fileName = "index.ts",
  terminalPath = "~/demo",
  width = 1240,
  fontSize = 23,
  delay = 0,
  typeFrames = 150,
}: CodeTerminalProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    config: { damping: 200, mass: 0.7 },
    durationInFrames: 30,
    fps,
    frame: frame - delay,
  });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const ty = interpolate(enter, [0, 1], [28, 0]);
  const scale = interpolate(enter, [0, 1], [0.97, 1]);

  const lines = code.split("\n");
  const typeStart = delay + 10;
  const codeChars = Math.floor(
    interpolate(
      frame,
      [typeStart, typeStart + typeFrames],
      [0, code.length],
      CLAMP
    )
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
    if (codeChars > (starts[i] ?? 0)) {
      activeLine = i;
    }
  }

  const commandStart = typeStart + typeFrames + 16;
  const blink = Math.floor((frame / fps) * 2) % 2 === 0;
  const lineH = Math.round(fontSize * 1.62);
  const codeCaretLive = frame < commandStart;

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
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.05)",
          borderRadius: 22,
          boxShadow:
            "0 40px 100px -34px rgba(15,23,42,0.30), 0 12px 36px -22px rgba(15,23,42,0.14)",
          fontFamily: MONO,
          overflow: "hidden",
        }}
      >
        {/* File header. */}
        <div
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.7)",
            borderBottom: "1px solid rgba(15,23,42,0.07)",
            display: "flex",
            height: 48,
            padding: "0 30px",
          }}
        >
          <span
            style={{
              color: "#475467",
              fontFamily: MONO,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {fileName}
          </span>
        </div>

        {/* Code pane — every line slot rendered so the height never shifts. */}
        <div
          style={{
            background: "#ffffff",
            fontSize,
            lineHeight: `${lineH}px`,
            padding: "26px 30px",
          }}
        >
          {lines.map((line, i) => {
            const budget = Math.max(
              0,
              Math.min(line.length, codeChars - (starts[i] ?? 0))
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
                    color: "#b4bcc4",
                    flexShrink: 0,
                    marginRight: 24,
                    textAlign: "right",
                    width: 32,
                  }}
                >
                  {i + 1}
                </span>
                <span>
                  {tokens.map((token, j) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: tokens are static and ordered
                      key={j}
                      style={{ color: LIGHT.syntax[token.type] }}
                    >
                      {token.text}
                    </span>
                  ))}
                  {i === activeLine && codeCaretLive && (
                    <Caret visible={blink} />
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <TerminalPane
          command={command}
          commandStart={commandStart}
          fontSize={fontSize}
          output={output}
          result={result}
          spinnerFrames={spinnerFrames}
          spinnerLabel={spinnerLabel}
          terminalPath={terminalPath}
        />
      </div>
    </div>
  );
};
