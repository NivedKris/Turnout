import Link from "next/link";
import { Suspense } from "react";
import { IntroGate } from "@/components/brand/BootScreen";
import { Wordmark } from "@/components/brand/Logo";
import { CommandBar } from "@/components/shell/CommandBar";
import { Rail } from "@/components/shell/Rail";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { TopBarData } from "./_c/TopBarData";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg/90 px-3 py-2 backdrop-blur md:px-4">
        <Link href="/" aria-label="Turnout home" className="shrink-0">
          <Wordmark />
        </Link>
        <Suspense fallback={<div className="h-7 flex-1" />}>
          <CommandBar />
        </Suspense>
        <Suspense fallback={<span className="font-mono text-[11px] text-fg-3">AS OF …</span>}>
          <TopBarData />
        </Suspense>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-line md:w-44 md:shrink-0 md:border-b-0 md:border-r lg:w-52">
          <div className="md:sticky md:top-[49px]">
            <Suspense fallback={null}>
              <Rail />
            </Suspense>
          </div>
        </aside>
        <main className="relative min-w-0 flex-1">{children}</main>
      </div>
      <IntroGate />
    </div>
  );
}
