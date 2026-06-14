"use client";

import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface PageActionsProps {
  // Pre-rendered on the server (RSC) and passed down, so the copy button works
  // from a string already in the payload — no client-side fetch round-trip.
  markdown: string;
  // Relative URL (e.g. /server.md) for the in-app "view raw" link.
  markdownUrl: string;
  // Source file on GitHub.
  githubUrl: string;
}

export const PageActions = ({
  markdown,
  markdownUrl,
  githubUrl,
}: PageActionsProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  return (
    <div className="not-prose mb-6 flex flex-row items-center gap-2">
      <Button onClick={handleCopy} size="sm" type="button" variant="outline">
        {copied ? (
          <Check data-icon="inline-start" />
        ) : (
          <Copy data-icon="inline-start" />
        )}
        {copied ? "Copied" : "Copy Markdown"}
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={markdownUrl} rel="noopener noreferrer" target="_blank">
          <FileText data-icon="inline-start" />
          View as Markdown
        </a>
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a href={githubUrl} rel="noopener noreferrer" target="_blank">
          <ExternalLink data-icon="inline-start" />
          Edit on GitHub
        </a>
      </Button>
    </div>
  );
};
