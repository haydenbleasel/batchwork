import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";

import { GlassCodeBlock } from "./glass-code-block";
import { Body, Heading } from "./scene-text";

interface SplitSceneProps {
  title: ReactNode;
  body: ReactNode;
  code: string;
  fileName: string;
  reversed?: boolean;
  extra?: ReactNode;
  codeFontSize?: number;
  codeWidth?: number;
  codeHeight?: number;
}

// Text column beside a frosted-glass editor window, alternating sides.
export const SplitScene = ({
  title,
  body,
  code,
  fileName,
  reversed = false,
  extra,
  codeFontSize,
  codeWidth,
  codeHeight,
}: SplitSceneProps) => {
  const text = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        gap: 26,
        width: 560,
      }}
    >
      <Heading delay={6}>{title}</Heading>
      <Body delay={16}>{body}</Body>
      {extra}
    </div>
  );

  const window = (
    <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
      <GlassCodeBlock
        code={code}
        delay={14}
        fontSize={codeFontSize}
        height={codeHeight}
        title={fileName}
        width={codeWidth}
      />
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: 56,
        padding: "110px 76px",
      }}
    >
      {reversed ? (
        <>
          {window}
          {text}
        </>
      ) : (
        <>
          {text}
          {window}
        </>
      )}
    </AbsoluteFill>
  );
};
