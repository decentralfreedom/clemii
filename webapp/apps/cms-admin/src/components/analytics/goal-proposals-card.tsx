// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Goals an agent proposed (hush-cms goals propose) wait for the owner here,
// as a Contributor's draft waits for an Editor in Ghost: shown only while one
// waits, whatever its quarter, with Approve and Reject. Approved goals are
// followed from the command line (hush-cms goals list).
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { getListGoalDraftsQueryKey, getListGoalsQueryKey, useApproveGoal, useArchiveGoal, useListGoalDrafts, type GoalObjective } from "@/api/cms.generated";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actorName } from "@/lib/actor-name";

export function GoalProposalsCard() {
  const list = useListGoalDrafts();
  const queryClient = useQueryClient();
  const approve = useApproveGoal();
  const reject = useArchiveGoal();
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListGoalDraftsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey().slice(0, 1) }),
  ]);
  const drafts: GoalObjective[] = list.data?.status === 200 ? list.data.data.objectives : [];
  if (!drafts.length) return null;
  return (
    <Card aria-label="Goal proposals">
      <CardHeader>
        <CardTitle>{drafts.length === 1 ? "A goal proposal waits for you" : `${drafts.length} goal proposals wait for you`}</CardTitle>
        <CardDescription>Approve one to track it; its numbers come from the CMS's data only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border-default">
        {drafts.map((objective) => (
          <div key={objective.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-medium">{objective.title}</p>
              <p className="text-sm text-text-secondary">{objective.quarter}, proposed by {actorName(objective.createdBy)}</p>
              <ul className="list-disc ps-5 text-sm text-text-secondary">
                {objective.keyResults.map((keyResult) => <li key={keyResult.id}>{keyResult.title}</li>)}
              </ul>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => void approve.mutateAsync({ id: objective.id }).then(refresh)}><Check />Approve</Button>
              <Button size="sm" variant="ghost" aria-label={`Reject ${objective.title}`} onClick={() => void reject.mutateAsync({ id: objective.id }).then(refresh)}><X />Reject</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
