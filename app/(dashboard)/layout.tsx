import Link from "next/link";
import { Suspense } from "react";
import { Tour, HelpButton } from "@/components/onboarding/Tour";
import { Welcome } from "@/components/onboarding/Welcome";
import { TerminalLink } from "@/components/shell/TerminalLink";
import { AssistantDock } from "@/components/assistant/AssistantDock";
import { CopilotDrawer } from "@/components/copilot/CopilotDrawer";
import { CopilotProvider } from "@/components/copilot/CopilotProvider";
import { Wordmark } from "@/components/brand/Logo";
import { CommandBar } from "@/components/shell/CommandBar";
import { Rail } from "@/components/shell/Rail";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={null}>
    <CopilotProvider>
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:px-6">
        <Link href="/" aria-label="Turnout home" className="shrink-0">
          <Wordmark />
        </Link>
        <div data-tour="command" className="min-w-0 max-w-xl flex-1">
          <Suspense fallback={<div className="h-8" />}>
            <CommandBar />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <TerminalLink />
          <ThemeToggle />
          <HelpButton />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-line md:w-44 md:shrink-0 md:border-b-0 md:border-r lg:w-52">
          <div data-tour="rail" className="md:sticky md:top-[49px]">
            <Suspense fallback={null}>
              <Rail />
            </Suspense>
          </div>
        </aside>
        <main className="relative min-w-0 flex-1 pb-20">{children}</main>
      </div>
      <CopilotDrawer />
      <AssistantDock />
      <Welcome />
      <Tour />
    </div>
    </CopilotProvider>
    </Suspense>
  );
}
