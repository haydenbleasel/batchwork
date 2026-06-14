import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const nextConfig: NextConfig = {
  redirects: () => [
    {
      destination: "/overview",
      permanent: true,
      source: "/docs",
    },
  ],
  rewrites: () => [
    {
      destination: "/llms.mdx/:path*",
      source: "/:path*.md",
    },
  ],
};

export default withMDX(nextConfig);
