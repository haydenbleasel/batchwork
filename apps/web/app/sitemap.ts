import type { MetadataRoute } from "next";

import { source } from "@/lib/source";

const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "localhost:3000";
const baseUrl = `${protocol}://${origin}`;

const sitemap = (): MetadataRoute.Sitemap => {
  const docsRoutes = source.getPages().map((page) => ({
    path: page.url,
    priority: page.url === "/overview" ? 0.9 : 0.7,
  }));

  return [{ path: "/", priority: 1 }, ...docsRoutes].map(
    ({ path, priority }) => ({
      changeFrequency: "weekly" as const,
      lastModified: new Date(),
      priority,
      url: `${baseUrl}${path}`,
    })
  );
};

export default sitemap;
