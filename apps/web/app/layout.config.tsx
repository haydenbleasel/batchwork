import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import type { SVGProps } from "react";

const Logo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 400 413"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <g clipPath="url(#clip0_6_37)">
      <path
        d="M0.00193387 235.381L0.998519 85.3896C1.17892 58.2384 20.1605 34.9786 46.3784 29.7819L191.213 1.07354C226.018 -5.8253 258.316 21.4078 258.077 57.4519L257.079 207.442C256.899 234.594 237.918 257.854 211.701 263.051L66.8651 291.759C32.0601 298.658 -0.237551 271.425 0.00193387 235.381Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path
        d="M70.9627 295.193L71.9592 145.202C72.1397 118.051 91.1212 94.7911 117.339 89.5944L262.174 60.886C296.979 53.9873 329.277 81.2203 329.037 117.264L328.041 267.256C327.861 294.407 308.878 317.667 282.661 322.863L137.826 351.572C103.021 358.471 70.7232 331.237 70.9627 295.193Z"
        fill="currentColor"
        fillOpacity="0.5"
      />
      <path
        d="M141.924 355.061L142.921 205.07C143.101 177.917 162.082 154.659 188.3 149.461L333.135 120.753C367.94 113.854 400.239 141.087 399.999 177.131L399.002 327.122C398.821 354.274 379.84 377.534 353.622 382.731L208.787 411.439C173.982 418.337 141.685 391.105 141.924 355.061Z"
        fill="currentColor"
        fillOpacity="0.8"
      />
    </g>
    <defs>
      <clipPath id="clip0_6_37">
        <rect width="100%" height="100%" fill="currentColor" />
      </clipPath>
    </defs>
  </svg>
);

export const baseOptions: BaseLayoutProps = {
  githubUrl: "https://github.com/haydenbleasel/batchwork",
  links: [
    { text: "Install", url: "/installation" },
    { text: "Usage", url: "/usage" },
    { text: "Providers", url: "/providers/openai" },
  ],
  nav: {
    title: (
      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <Logo className="size-4" />
        <p className="font-medium">Batchwork</p>
      </div>
    ),
  },
};
