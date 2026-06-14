"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

export const FadeIn = ({
  children,
  className,
  delay = 0,
  y = 12,
}: FadeInProps) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y }}
    transition={{ delay, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    viewport={{ margin: "-80px", once: true }}
    whileInView={{ opacity: 1, y: 0 }}
  >
    {children}
  </motion.div>
);
