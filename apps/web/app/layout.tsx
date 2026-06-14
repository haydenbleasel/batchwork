import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import type { ReactNode } from "react";

import { MotionProvider } from "@/components/motion-provider";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "localhost:3000";
const baseUrl = `${protocol}://${origin}`;

const title = "Save up to 50% on LLM costs | Batchwork";
const description =
  "Unified batch API for AI providers. Process LLM requests in bulk with a single call. Processing, uploading, polling, and result parsing handled for you.";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
  description,
  metadataBase: new URL(baseUrl),
  openGraph: {
    description,
    locale: "en_US",
    siteName: "Batchwork",
    title,
    type: "website",
    url: "/",
  },
  title: {
    default: title,
    template: "%s · Batchwork",
  },
  twitter: {
    card: "summary_large_image",
    description,
    title,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  author: { "@type": "Person", name: "Hayden Bleasel" },
  codeRepository: "https://github.com/haydenbleasel/batchwork",
  description,
  license: "https://opensource.org/licenses/MIT",
  name: "Batchwork",
  programmingLanguage: "TypeScript",
  url: baseUrl,
};

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => (
  <html
    className={cn(
      "touch-manipulation scroll-smooth font-sans antialiased",
      geistSans.variable,
      geistMono.variable
    )}
    data-scroll-behavior="smooth"
    lang="en"
    suppressHydrationWarning
  >
    <body className="flex min-h-full flex-col">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <RootProvider search={{ options: { api: "/search" } }}>
        <MotionProvider>{children}</MotionProvider>
      </RootProvider>
    </body>
  </html>
);

export default RootLayout;
