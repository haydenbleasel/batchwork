import Link from "next/link";

const PROJECT_LINKS = [
  { href: "/overview", label: "Docs" },
  { href: "/usage", label: "Usage" },
  { href: "/server", label: "Server" },
  { href: "/providers", label: "Providers" },
];

const RESOURCE_LINKS = [
  {
    external: true,
    href: "https://github.com/haydenbleasel/batchwork",
    label: "GitHub",
  },
  {
    external: true,
    href: "https://www.npmjs.com/package/batchwork",
    label: "npm",
  },
  {
    external: true,
    href: "https://github.com/haydenbleasel/batchwork/issues",
    label: "Issues",
  },
];

interface FooterLinkProps {
  href: string;
  external?: boolean;
  children: string;
}

const FooterLink = ({ href, external, children }: FooterLinkProps) =>
  external ? (
    <a
      className="font-normal text-base text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  ) : (
    <Link
      className="font-normal text-base text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
      href={href}
    >
      {children}
    </Link>
  );

export const Footer = () => (
  <footer className="border-t border-dotted">
    <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
      <div className="flex flex-col gap-10 sm:flex-row sm:justify-between sm:gap-16">
        <div className="flex max-w-[40ch] flex-col gap-2">
          <p className="font-semibold text-base text-foreground">batchwork</p>
          <p className="text-pretty text-base text-muted-foreground leading-relaxed sm:text-sm">
            The missing batch API for the Vercel AI SDK. Open source, MIT
            licensed.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:gap-x-16">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
              Project
            </p>
            <ul className="flex flex-col gap-2">
              {PROJECT_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <FooterLink href={href}>{label}</FooterLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
              Resources
            </p>
            <ul className="flex flex-col gap-2">
              {RESOURCE_LINKS.map(({ external, href, label }) => (
                <li key={href}>
                  <FooterLink external={external} href={href}>
                    {label}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-12 flex flex-col gap-3 border-t border-dotted pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs">
          &copy; {new Date().getFullYear()} Hayden Bleasel
        </p>
        <p className="font-mono text-muted-foreground text-xs">MIT License</p>
      </div>
    </div>
  </footer>
);
