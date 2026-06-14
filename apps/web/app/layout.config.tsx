import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import type { SVGProps } from "react";

const Logo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>batchwork</title>
    <rect fill="currentColor" height="4" rx="2" width="18" x="3" y="3.5" />
    <rect
      fill="currentColor"
      height="4"
      opacity="0.7"
      rx="2"
      width="18"
      x="3"
      y="10"
    />
    <rect
      fill="currentColor"
      height="4"
      opacity="0.4"
      rx="2"
      width="11"
      x="3"
      y="16.5"
    />
  </svg>
);

export const baseOptions: BaseLayoutProps = {
  githubUrl: "https://github.com/haydenbleasel/batchwork",
  links: [
    { text: "Docs", url: "/overview" },
    { text: "Server", url: "/server" },
    { text: "Providers", url: "/providers" },
  ],
  nav: {
    title: (
      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        <Logo className="size-4" />
        <p className="font-medium">batchwork</p>
      </div>
    ),
  },
};
