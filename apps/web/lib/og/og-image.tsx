import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

export const OG_SIZE = { height: 630, width: 1200 };
export const OG_CONTENT_TYPE = "image/png";

// Geist (Satori reads woff/ttf/otf, not woff2). Read from disk rather than
// fetched — these images are statically prerendered at build (Node), and
// fetching a bundler asset URL isn't supported during prerender. The promise is
// memoized so a full build doesn't re-read the files per image.
const fontPath = (file: string) =>
  path.join(process.cwd(), "lib/og-fonts", file);
let fontsPromise: Promise<Buffer[]> | undefined;
const getFonts = () => {
  fontsPromise ??= Promise.all([
    readFile(fontPath("Geist-Regular.woff")),
    readFile(fontPath("Geist-Medium.woff")),
    readFile(fontPath("GeistMono-Regular.woff")),
  ]);
  return fontsPromise;
};

// Tailwind neutral scale resolved from the homepage's oklch theme tokens:
// FOREGROUND = --foreground, MUTED = --muted-foreground, FAINT = that at 60%,
// BORDER = --border.
const FOREGROUND = "#0a0a0a";
const MUTED = "#737373";
const FAINT = "#a3a3a3";
const BORDER = "#e5e5e5";

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

interface OgImageOptions {
  title: string;
  description?: string;
}

// Shared card behind every OG image — matches the homepage aesthetic. The
// docs route and the root opengraph-image both call this with their own copy.
export const renderOgImage = async ({ title, description }: OgImageOptions) => {
  const [geist, geistMedium, geistMono] = await getFonts();

  return new ImageResponse(
    <div
      style={{
        backgroundColor: "#fafafa",
        color: FOREGROUND,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Geist",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
        <svg
          aria-hidden="true"
          fill="none"
          height={34}
          viewBox="0 0 400 413"
          width={33}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0.00193387 235.381L0.998519 85.3896C1.17892 58.2384 20.1605 34.9786 46.3784 29.7819L191.213 1.07354C226.018 -5.8253 258.316 21.4078 258.077 57.4519L257.079 207.442C256.899 234.594 237.918 257.854 211.701 263.051L66.8651 291.759C32.0601 298.658 -0.237551 271.425 0.00193387 235.381Z"
            fill={FOREGROUND}
            fillOpacity="0.2"
          />
          <path
            d="M70.9627 295.193L71.9592 145.202C72.1397 118.051 91.1212 94.7911 117.339 89.5944L262.174 60.886C296.979 53.9873 329.277 81.2203 329.037 117.264L328.041 267.256C327.861 294.407 308.878 317.667 282.661 322.863L137.826 351.572C103.021 358.471 70.7232 331.237 70.9627 295.193Z"
            fill={FOREGROUND}
            fillOpacity="0.5"
          />
          <path
            d="M141.924 355.061L142.921 205.07C143.101 177.917 162.082 154.659 188.3 149.461L333.135 120.753C367.94 113.854 400.239 141.087 399.999 177.131L399.002 327.122C398.821 354.274 379.84 377.534 353.622 382.731L208.787 411.439C173.982 418.337 141.685 391.105 141.924 355.061Z"
            fill={FOREGROUND}
            fillOpacity="0.8"
          />
        </svg>
        <div
          style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.01em" }}
        >
          Batchwork
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 500,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            maxWidth: 1010,
          }}
        >
          {truncate(title, 64)}
        </div>
        {description ? (
          <div
            style={{
              color: MUTED,
              fontSize: 29,
              lineHeight: 1.4,
              marginTop: 28,
              maxWidth: 900,
            }}
          >
            {truncate(description, 150)}
          </div>
        ) : null}
      </div>

      <div
        style={{
          alignItems: "center",
          borderTop: `1px solid ${BORDER}`,
          color: MUTED,
          display: "flex",
          fontFamily: "Geist Mono",
          fontSize: 21,
          justifyContent: "space-between",
          paddingTop: 28,
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 11 }}>
          <svg
            aria-hidden="true"
            fill={MUTED}
            height={23}
            viewBox="0 0 24 24"
            width={23}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span>haydenbleasel/batchwork</span>
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: 9 }}>
          <span style={{ color: FAINT }}>$</span>
          <span>npm install batchwork</span>
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { data: geist, name: "Geist", style: "normal", weight: 400 },
        { data: geistMedium, name: "Geist", style: "normal", weight: 500 },
        { data: geistMono, name: "Geist Mono", style: "normal", weight: 400 },
      ],
    }
  );
};
