import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";

import { fadeUp } from "../lib/animation";
import { SANS } from "../lib/fonts";
import { COLORS } from "../theme";

interface HeadingProps {
  children: ReactNode;
  delay?: number;
  fontSize?: number;
}

export const Heading = ({
  children,
  delay = 0,
  fontSize = 66,
}: HeadingProps) => {
  const frame = useCurrentFrame();
  return (
    <h2
      style={{
        color: COLORS.foreground,
        fontFamily: SANS,
        fontSize,
        fontWeight: 500,
        letterSpacing: "-0.03em",
        lineHeight: 1.28,
        margin: 0,
        textWrap: "balance",
        ...fadeUp(frame, delay),
      }}
    >
      {children}
    </h2>
  );
};

interface BodyProps {
  children: ReactNode;
  delay?: number;
  maxWidth?: number;
}

export const Body = ({ children, delay = 0, maxWidth = 540 }: BodyProps) => {
  const frame = useCurrentFrame();
  return (
    <p
      style={{
        color: COLORS.muted,
        fontFamily: SANS,
        fontSize: 27,
        lineHeight: 1.55,
        margin: 0,
        maxWidth,
        textWrap: "pretty",
        ...fadeUp(frame, delay),
      }}
    >
      {children}
    </p>
  );
};
