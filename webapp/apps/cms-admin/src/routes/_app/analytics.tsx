// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The site's analytics, laid out as Ghost Admin's: tabs by the question they
// answer (components/analytics/tabs), an Overview at a glance and the detail
// one click further; a post opens its own analytics from any list. The tab,
// range, channel and quarter live in the address, so a view can be shared.
// The route file holds only the address and the frame: each tab is its own
// component, and the router splits this route's component into its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import type { TrafficSourceRowChannel } from "@/api/cms.generated";
import { GoalsView } from "@/components/analytics/goals-view";
import { RangeSelect } from "@/components/analytics/range-select";
import { OverviewTab } from "@/components/analytics/tabs/overview-tab";
import { SearchTab } from "@/components/analytics/tabs/search-tab";
import { TrafficTab } from "@/components/analytics/tabs/traffic-tab";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defaultAnalyticsRange, isAnalyticsRange, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { isChannel } from "@/lib/traffic-labels";

const tabs = ["overview", "search", "traffic", "goals"] as const;
type Tab = (typeof tabs)[number];
const isTab = (value: unknown): value is Tab => typeof value === "string" && (tabs as readonly string[]).includes(value);

export const Route = createFileRoute("/_app/analytics")({
  validateSearch: (search: Record<string, unknown>): { tab?: Exclude<Tab, "overview">; quarter?: string; range?: AnalyticsRangeKey; channel?: TrafficSourceRowChannel } => ({
    ...(isTab(search.tab) && search.tab !== "overview" ? { tab: search.tab } : {}),
    ...(typeof search.quarter === "string" && /^\d{4}-Q[1-4]$/.test(search.quarter) ? { quarter: search.quarter } : {}),
    ...(isAnalyticsRange(search.range) && search.range !== defaultAnalyticsRange ? { range: search.range } : {}),
    ...(isChannel(search.channel) ? { channel: search.channel } : {}),
  }),
  component: Analytics,
});

function Analytics() {
  const { tab = "overview", quarter, range = defaultAnalyticsRange, channel } = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = (next: Tab, nextChannel?: TrafficSourceRowChannel) =>
    void navigate({ search: (previous) => ({ ...previous, tab: next === "overview" ? undefined : next, channel: nextChannel }) });

  return (
    <div className="mx-auto flex w-full max-w-(--content-width) flex-col px-(--page-gutter) pb-12">
      <header className="flex flex-col gap-4 pt-[28px] pb-6">
        <h1 className="text-3xl leading-tight font-bold tracking-tight">Analytics</h1>
        <div className="flex items-center justify-between gap-4 border-b border-border-default">
          <Tabs value={tab} onValueChange={(value) => go(value as Tab)} variant="underline">
            <TabsList aria-label="Analytics">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="traffic">Traffic</TabsTrigger>
              <TabsTrigger value="goals">Goals</TabsTrigger>
            </TabsList>
          </Tabs>
          {tab !== "goals" && <RangeSelect value={range} onChange={(next) => void navigate({ search: (previous) => ({ ...previous, range: next === defaultAnalyticsRange ? undefined : next }) })} />}
        </div>
      </header>
      {tab === "overview" && <OverviewTab range={range} onTraffic={(next) => go("traffic", next)} />}
      {tab === "search" && <SearchTab range={range} />}
      {tab === "traffic" && <TrafficTab range={range} channel={channel} onChannel={(next) => go("traffic", next)} />}
      {tab === "goals" && <GoalsView quarter={quarter} onQuarter={(next) => void navigate({ search: (previous) => ({ ...previous, quarter: next }) })} />}
    </div>
  );
}
