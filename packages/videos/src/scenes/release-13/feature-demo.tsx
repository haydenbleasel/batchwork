import { AbsoluteFill, useCurrentFrame } from "remotion";

import { CodeTerminal } from "../../components/code-terminal";
import { fadeUp } from "../../lib/animation";
import { SANS } from "../../lib/fonts";
import { LIGHT } from "../../theme";

interface FeatureDemoProps {
  code: string;
  command: string;
  fileName: string;
  output: string[];
  result: string;
  spinnerLabel: string;
  terminalPath: string;
  /** Short feature label above the card (e.g. "Audio transcription"). */
  title: string;
}

// One 1.3 feature: a compact heading above the standard code + terminal card,
// tightened (fewer type frames) so four of these fit one release video.
export const FeatureDemo = ({
  code,
  command,
  fileName,
  output,
  result,
  spinnerLabel,
  terminalPath,
  title,
}: FeatureDemoProps) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        gap: 34,
        justifyContent: "center",
        padding: "60px 120px",
      }}
    >
      <h2
        style={{
          color: LIGHT.foreground,
          fontFamily: SANS,
          fontSize: 44,
          fontWeight: 500,
          letterSpacing: "-0.03em",
          margin: 0,
          ...fadeUp(frame, 4),
        }}
      >
        {title}
      </h2>
      <CodeTerminal
        code={code}
        command={command}
        delay={8}
        fileName={fileName}
        fontSize={22}
        output={output}
        result={result}
        spinnerLabel={spinnerLabel}
        terminalPath={terminalPath}
        typeFrames={120}
        width={1300}
      />
    </AbsoluteFill>
  );
};
