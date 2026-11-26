import { Suspense } from "react";
import { TurnoutMark } from "@/components/brand/Logo";

export const metadata = { title: "Unlock" };

export default function UnlockPage(props: PageProps<"/unlock">) {
  return (
    <main className="relative flex flex-1 items-center justify-center p-6">
      <div aria-hidden className="tn-dotfield pointer-events-none absolute inset-0" />
      <Suspense>
        <UnlockForm {...props} />
      </Suspense>
    </main>
  );
}

async function UnlockForm({ searchParams }: PageProps<"/unlock">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return (
    <form method="post" action="/api/unlock" className="relative flex w-full max-w-sm flex-col items-center gap-5 border border-line bg-surface p-8">
      <TurnoutMark size={56} boot />
      <h1 className="font-dot text-4xl font-bold tracking-[0.12em]">TURNOUT</h1>
      <p className="text-center text-sm text-fg-2">Growth center for CampusFest. Enter the passcode shared in the submission.</p>
      <input type="hidden" name="next" value={next} />
      <label className="w-full">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-3">Passcode</span>
        <input name="passcode" type="password" autoFocus required className="mt-1 w-full border border-line bg-bg px-3 py-2 font-mono text-fg outline-none focus:border-fg" />
      </label>
      {sp.error && <p role="alert" className="font-mono text-[11px]">✕ Wrong passcode</p>}
      <button type="submit" className="w-full bg-fg py-2 font-mono text-[12px] font-bold tracking-widest text-bg">
        UNLOCK &lt;GO&gt;
      </button>
    </form>
  );
}
