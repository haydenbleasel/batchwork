import { CodeBlock } from "@/components/code-block";
import { cn } from "@/lib/utils";

interface CodeWindowProps {
  code: string;
  /** File name shown in the window title bar. */
  name: string;
  lang?: string;
  className?: string;
  /** Strip the title bar, leaving just the bordered snippet. */
  bare?: boolean;
}

// A code block dressed up as an editor window: a traffic-light title bar above a
// shiki-highlighted snippet, lifted off the page by a soft pastel halo.
// Highlighting happens server-side (see CodeBlock). Pass `bare` to drop the
// title bar.
export const CodeWindow = ({
  code,
  name,
  lang = "ts",
  className,
  bare = false,
}: CodeWindowProps) => (
  <div className={cn("relative isolate min-w-0 max-w-full", className)}>
    {/* Blurred gradient bleeding out past the window edges. */}
    <div
      aria-hidden
      className="code-glow -inset-6 -z-10 absolute rounded-[2.5rem] opacity-90 blur-2xl sm:-inset-10 dark:opacity-40"
    />
    <div className="code-window max-w-full overflow-hidden rounded-2xl border border-border bg-card text-left">
      {!bare && (
        <div className="flex min-w-0 items-center gap-1.5 border-b border-dotted px-4 py-3">
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="ml-2 min-w-0 truncate font-mono text-muted-foreground text-xs">
            {name}
          </span>
        </div>
      )}
      <CodeBlock
        className="m-0! rounded-none! border-0! bg-transparent! shadow-none!"
        code={code}
        lang={lang}
      />
    </div>
  </div>
);
