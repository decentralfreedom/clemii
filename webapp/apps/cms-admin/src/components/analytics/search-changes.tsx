// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The days a post went live or changed in the range, from the audit log, to
// read its numbers against: did a new title lift the clicks? Days are Search
// Console's (US Pacific), as the chart's.
import { CalendarClock, Pencil, Send, Undo2 } from "lucide-react";
import type { PostSearch } from "@/api/cms.generated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const labels = { published: "Published", scheduled: "Scheduled", unpublished: "Unpublished", edited: "Changed" } as const;
const icons = { published: <Send />, scheduled: <CalendarClock />, unpublished: <Undo2 />, edited: <Pencil /> } as const;

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const actorName = (actor: string) => (actor.startsWith("github:") ? `@${actor.slice(7)}` : actor.startsWith("token:") ? actor.slice(6) : actor);

export function SearchChanges({ markers }: { markers: PostSearch["markers"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Changes in this period</CardTitle>
        <CardDescription>When the post went live or its title, description or content changed.</CardDescription>
      </CardHeader>
      <CardContent>
        {markers.length ? (
          <ol aria-label="Changes" className="flex flex-col gap-3">
            {[...markers].reverse().map((marker, index) => (
              <li key={`${marker.date}-${index}`} className="flex items-start gap-3 text-sm">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3.5">{icons[marker.kind]}</span>
                <span className="flex flex-col">
                  <span className="font-medium">{labels[marker.kind]}{marker.changes.length ? `: ${marker.changes.join(", ")}` : ""}</span>
                  <span className="text-text-secondary">{day(marker.date)} by {actorName(marker.actor)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-text-secondary">No changes in this period.</p>
        )}
      </CardContent>
    </Card>
  );
}
