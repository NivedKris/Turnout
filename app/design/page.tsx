import type { Metadata } from "next";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Design system" };

export default function DesignPage() {
  return (
    <main className="relative flex-1">
      <div aria-hidden className="tn-dotfield pointer-events-none absolute inset-x-0 top-0 h-[480px]" />
      <div className="relative">
        <Gallery />
      </div>
    </main>
  );
}
