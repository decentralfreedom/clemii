// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The Goals tab (PRD: the Goals tab, AI-native goals): a quarter's objectives,
// each key result with its value, target and pace from the CMS's numbers. An
// agent's proposal (hush-cms goals propose) waits here as a draft for the
// owner; the owner's own goals come from the same catalog, so no goal can name
// what the data does not have. Manual key results are labelled and checked in
// by hand.
import { useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Archive, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  getListGoalsQueryKey, useApproveGoal, useArchiveGoal, useCheckInGoal, useGetGoalCatalog, useListGoals, useProposeGoal,
  type GoalKeyResult, type GoalObjective, type NewGoalObjectiveKeyResultsItem,
} from "@/api/cms.generated";
import { CmsError } from "@/api/fetcher";
import { analyticsDay } from "@/components/analytics/data-source";
import { actorName } from "@/lib/actor-name";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { channelLabels, isChannel, pageTypeLabels } from "@/lib/traffic-labels";

type Metric = NonNullable<GoalKeyResult["metric"]>;
const rates: Metric[] = ["ctr", "conversion"];

/** A value as its metric reads: shares as percentages, positions with one decimal, counts whole. */
function format(metric: GoalKeyResult["metric"], value: number | null | undefined) {
  if (value === null || value === undefined) return "–";
  if (metric && rates.includes(metric)) return `${(value * 100).toFixed(1)}%`;
  if (metric === "position") return value.toFixed(1);
  return new Intl.NumberFormat("en").format(Math.round(value));
}

/** The quarter of a day, and the quarters around it. */
function quartersAround(today = new Date()) {
  const year = today.getUTCFullYear(), quarter = Math.floor(today.getUTCMonth() / 3) + 1;
  const shift = (by: number) => { const index = year * 4 + quarter - 1 + by; return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`; };
  return { current: shift(0), options: [shift(-1), shift(0), shift(1)] };
}

function KeyResultRow({ keyResult, objective }: { keyResult: GoalKeyResult; objective: GoalObjective }) {
  const queryClient = useQueryClient();
  const checkIn = useCheckInGoal();
  const [value, setValue] = useState("");
  const { progress, measured, metric } = keyResult;
  const share = Math.max(0, Math.min(1, progress.share ?? 0));
  const late = measured?.from && measured.from > objective.period.from;
  return (
    <li className="flex flex-col gap-2 py-3" data-testid="key-result">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{keyResult.title}</span>
        <span className="text-sm tabular-nums"><strong>{format(metric, progress.value)}</strong> <span className="text-text-secondary">of {format(metric, keyResult.target)}</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${keyResult.title}: progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <div className="h-full rounded-full bg-[var(--chart-blue)] transition-[width] motion-reduce:transition-none" style={{ width: `${share * 100}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        {keyResult.kind === "manual" ? (
          <span>Manual: entered by hand{progress.value === null ? ", not yet" : ""}</span>
        ) : (
          <>
            {progress.projected !== null && <span>{metric && (rates.includes(metric) || metric === "position") ? "Now" : "On pace for"} {format(metric, progress.projected)}{progress.onTrack !== null && <Badge variant={progress.onTrack ? "secondary" : "outline"} className="ms-2">{progress.onTrack ? "On track" : "Behind"}</Badge>}</span>}
            {late && <span>Counted from {analyticsDay(measured!.from!)}, when the numbers start</span>}
            {measured?.taggedOnly && <span>Downloads through tagged links only</span>}
            {keyResult.baseline !== null && <span>Period before: {format(metric, keyResult.baseline)}</span>}
            {measured?.value === null && <span>No numbers yet for this period</span>}
          </>
        )}
      </div>
      {keyResult.kind === "manual" && objective.status !== "archived" && (
        <form className="flex items-center gap-2" onSubmit={(event) => {
          event.preventDefault();
          void checkIn.mutateAsync({ id: keyResult.id, data: { value: Number(value) } })
            .then(() => { setValue(""); return queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey().slice(0, 1) }); })
            .catch((error: unknown) => toast.error(error instanceof CmsError ? error.message : "The value could not be saved."));
        }}>
          <Input aria-label={`${keyResult.title}: current value`} type="number" inputMode="decimal" className="h-8 w-28" value={value} onChange={(event) => setValue(event.target.value)} />
          <Button type="submit" size="sm" variant="outline" disabled={value === ""}>Check in</Button>
        </form>
      )}
    </li>
  );
}

function ObjectiveCard({ objective }: { objective: GoalObjective }) {
  const queryClient = useQueryClient();
  const approve = useApproveGoal();
  const archive = useArchiveGoal();
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey().slice(0, 1) });
  const draft = objective.status === "draft";
  return (
    <Card data-testid="objective">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex flex-wrap items-center gap-2">{objective.title}{draft && <Badge variant="outline">Draft</Badge>}</CardTitle>
          <CardDescription>
            {draft ? `Proposed by ${actorName(objective.createdBy)}: approve it to track it.` : `${analyticsDay(objective.period.from)} to ${analyticsDay(objective.period.to)}`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {draft && <Button size="sm" onClick={() => void approve.mutateAsync({ id: objective.id }).then(refresh)}><Check />Approve</Button>}
          <Button size="sm" variant="ghost" aria-label={draft ? `Reject ${objective.title}` : `Archive ${objective.title}`} onClick={() => void archive.mutateAsync({ id: objective.id }).then(refresh)}>
            {draft ? <><X />Reject</> : <Archive />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ol aria-label={`Key results of ${objective.title}`} className="divide-y divide-border-default">
          {objective.keyResults.map((keyResult) => <KeyResultRow key={keyResult.id} keyResult={keyResult} objective={objective} />)}
        </ol>
      </CardContent>
    </Card>
  );
}

type Draft = { title: string; kind: "measured" | "manual"; metric: Metric; scope: string; target: string };
const blank: Draft = { title: "", kind: "measured", metric: "pageviews", scope: "site", target: "" };

/** A scope as one choice: "site", or "postId:<id>", "channel:<name>", and so on. */
const scopeOf = (choice: string) => (choice === "site" ? {} : { [choice.slice(0, choice.indexOf(":"))]: choice.slice(choice.indexOf(":") + 1) });

function NewObjectiveDialog({ open, onOpenChange, quarter }: { open: boolean; onOpenChange: (open: boolean) => void; quarter: string }) {
  const queryClient = useQueryClient();
  const catalog = useGetGoalCatalog({ query: { enabled: open } });
  const known = catalog.data?.status === 200 ? catalog.data.data : undefined;
  const propose = useProposeGoal();
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Draft[]>([blank]);
  const update = (index: number, change: Partial<Draft>) => setRows((current) => current.map((row, at) => (at === index ? { ...row, ...change } : row)));
  const complete = title.trim() && rows.every((row) => row.title.trim() && row.target !== "" && Number(row.target) >= 0);
  const submit = async () => {
    const keyResults: NewGoalObjectiveKeyResultsItem[] = rows.map((row) => (row.kind === "manual"
      ? { title: row.title, kind: "manual", target: Number(row.target) }
      : { title: row.title, kind: "measured", metric: row.metric, scope: scopeOf(row.scope), target: Number(row.target) }));
    try {
      await propose.mutateAsync({ data: { quarter, title, keyResults } });
      await queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey().slice(0, 1) });
      onOpenChange(false); setTitle(""); setRows([blank]);
    } catch (error) {
      toast.error(error instanceof CmsError ? error.message : "The goal could not be saved.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New objective for {quarter}</DialogTitle>
          <DialogDescription>Every measured key result counts from the CMS's own numbers; only what the data has can be chosen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="goal-title">Objective</Label>
            <Input id="goal-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Become the answer for private Mac dictation" />
          </div>
          {rows.map((row, index) => (
            <fieldset key={index} className="grid gap-2 rounded-md border border-border-default p-3" aria-label={`Key result ${index + 1}`}>
              <Input aria-label={`Key result ${index + 1}`} value={row.title} onChange={(event) => update(index, { title: event.target.value })} placeholder="Key result, e.g. Downloads from the Reddit launch" />
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_7rem]">
                <Select value={row.kind} onValueChange={(kind) => update(index, { kind: kind as Draft["kind"] })}>
                  <SelectTrigger aria-label="Kind"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="measured">Measured</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                </Select>
                {row.kind === "measured" ? (
                  <>
                    <Select value={row.metric} onValueChange={(metric) => update(index, { metric: metric as Metric })}>
                      <SelectTrigger aria-label="Metric"><SelectValue /></SelectTrigger>
                      <SelectContent>{known?.metrics.map((metric) => <SelectItem key={metric.name} value={metric.name}>{metric.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={row.scope} onValueChange={(scope) => update(index, { scope })}>
                      <SelectTrigger aria-label="For"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="site">The whole site</SelectItem>
                        {known?.posts.map((post) => <SelectItem key={post.id} value={`postId:${post.id}`}>{post.title} <span className="text-text-secondary">{post.path}</span></SelectItem>)}
                        {known?.channels.map((channel) => <SelectItem key={channel} value={`channel:${channel}`}>{isChannel(channel) ? channelLabels[channel] : channel}</SelectItem>)}
                        {known?.pageTypes.map((type) => <SelectItem key={type} value={`pageType:${type}`}>{pageTypeLabels[type as keyof typeof pageTypeLabels] ?? type} pages</SelectItem>)}
                        {known?.sources.filter(Boolean).map((source) => <SelectItem key={source} value={`source:${source}`}>From {source}</SelectItem>)}
                        {known?.campaigns.filter(Boolean).map((campaign) => <SelectItem key={campaign} value={`campaign:${campaign}`}>Campaign {campaign}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </>
                ) : <span className="self-center text-sm text-text-secondary sm:col-span-2">You enter its value at each check-in.</span>}
                <Input aria-label="Target" type="number" inputMode="decimal" value={row.target} onChange={(event) => update(index, { target: event.target.value })} placeholder="Target" />
              </div>
            </fieldset>
          ))}
          {rows.length < 5 && <Button variant="outline" size="sm" className="w-fit" onClick={() => setRows((current) => [...current, blank])}><Plus />Add key result</Button>}
        </div>
        <DialogFooter><Button disabled={!complete || propose.isPending} onClick={() => void submit()}>Save objective</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function GoalsView({ quarter: picked, onQuarter }: { quarter?: string; onQuarter: (quarter: string) => void }) {
  const { current, options: around } = quartersAround();
  const quarter = picked ?? current;
  // A quarter from the address stays selectable, even when it is not around today.
  const options = around.includes(quarter) ? around : [quarter, ...around].sort();
  const [open, setOpen] = useState(false);
  const goals = useListGoals({ quarter });
  const objectives = goals.data?.status === 200 ? goals.data.data.objectives : [];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={quarter} onValueChange={onQuarter}>
          <SelectTrigger aria-label="Quarter" className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => setOpen(true)}><Plus />New objective</Button>
      </div>
      {goals.isPending ? (
        <p className="py-12 text-center text-sm text-text-secondary">Loading…</p>
      ) : !objectives.length ? (
        <p className="py-12 text-center text-sm text-text-secondary">No goals for {quarter}. Make one here, or let an agent propose one with <code>hush-cms goals propose</code>; it waits here for you.</p>
      ) : (
        objectives.map((objective) => <ObjectiveCard key={objective.id} objective={objective} />)
      )}
      <NewObjectiveDialog open={open} onOpenChange={setOpen} quarter={quarter} />
    </div>
  );
}
