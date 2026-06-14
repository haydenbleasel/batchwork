import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";

import { baseOptions } from "@/app/layout.config";
import { source } from "@/lib/source";

const Layout = ({ children }: { children: ReactNode }) => (
  <DocsLayout
    sidebar={{
      className: "sm:bg-transparent! border-r! xl:border-r-0!",
      collapsible: false,
    }}
    tabMode="navbar"
    tree={source.pageTree}
    {...baseOptions}
    links={[]}
    nav={{
      ...baseOptions.nav,
      mode: "top",
    }}
  >
    {children}
  </DocsLayout>
);

export default Layout;
