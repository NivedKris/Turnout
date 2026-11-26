import { Suspense } from "react";
import { BetForm } from "@/components/strategy/Forms";
import { Page, PageHeader, PageSkeleton } from "@/components/ui/page";
import { betsView } from "@/lib/server/views";

export const metadata = { title: "New bet" };

export default function NewBetPage(props: PageProps<"/bets/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewBet {...props} />
    </Suspense>
  );
}

async function NewBet({ searchParams }: PageProps<"/bets/new">) {
  const sp = await searchParams;
  const v = await betsView(typeof sp.asOf === "string" ? sp.asOf : undefined);
  return (
    <Page>
      <PageHeader title="New bet" subtitle="A strategy you want to test: what you believe, what it costs, what it should add, and the signals that will tell you early." />
      <BetForm
        asOf={v.meta.asOf}
        campaigns={v.campaigns}
        owners={v.owners}
        init={{
          rank: v.bets.length + 1,
          title: "",
          hypothesis: "",
          rationale: "",
          campaign_ids: [],
          owner_name: v.owners[0] ?? "",
          budget_inr: 20000,
          start_day: v.meta.asOf,
          end_day: v.meta.regCloseDay,
          expected_visitors: 100,
          rice: { reach: 10000, impact: 1, confidence: 0.5, effort: 2 },
          status: "proposed",
          signals: [{ key: "cpr", label: "Cost per registration (14d)", metric: "cost_per_registration", window_days: 14, direction: "lower_is_better", scale_if: 50, stop_if: 120, min_sample: 15 }],
          risks: "",
        }}
      />
    </Page>
  );
}
