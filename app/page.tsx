export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-6 px-8 py-24 sm:px-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-3">Growth Center · Bengaluru</p>
      <h1 className="font-dot text-6xl font-bold leading-none sm:text-8xl">TURNOUT</h1>
      <p className="max-w-md text-fg-2">
        Attendee growth command center for CampusFest. Scaffold online. Dashboard, management and copilot are coming
        in the next phases.
      </p>
      <a href="/api/health" className="font-mono text-sm text-fg-2 underline underline-offset-4 hover:text-fg">
        /api/health
      </a>
    </main>
  );
}
