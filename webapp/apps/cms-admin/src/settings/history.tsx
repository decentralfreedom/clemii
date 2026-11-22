// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// History, as Ghost Admin's (apps/admin/src/settings/advanced: history.tsx,
// history-modal.tsx): a card under Advanced opens the log of who or which
// token changed what (PRD R13), newest first, loading more on scroll, with a
// filter. Entries name a post as it was then and link to it.
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Ban, Check, KeyRound, ListFilter, LogIn, Pencil, Plus, Send, Trash2, Undo2, ImageUp, CalendarClock, History as HistoryIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { listAudit, type AuditEntry, type ListAuditArea } from "@/api/cms.generated";
import { ActionList, ActionListItem, ActionListItemContent } from "@/components/ui/action-list";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

const pageSize = 50;

const actions: Record<AuditEntry["action"], { title: string; icon: ReactNode }> = {
  "post.created": { title: "Post added", icon: <Plus /> },
  "post.edited": { title: "Post edited", icon: <Pencil /> },
  "post.image_uploaded": { title: "Image uploaded", icon: <ImageUp /> },
  "post.scheduled": { title: "Post scheduled", icon: <CalendarClock /> },
  "post.published": { title: "Post published", icon: <Send /> },
  "post.unpublished": { title: "Post unpublished", icon: <Undo2 /> },
  "post.approved": { title: "Post approved", icon: <Check /> },
  "post.deleted": { title: "Post deleted", icon: <Trash2 /> },
  "token.created": { title: "Token added", icon: <KeyRound /> },
  "token.revoked": { title: "Token revoked", icon: <Ban /> },
  "device.approved": { title: "CLI sign-in approved", icon: <Check /> },
  "device.denied": { title: "CLI sign-in denied", icon: <Ban /> },
  "owner.signed_in": { title: "Signed in", icon: <LogIn /> },
};

/** The actor as a person reads it: @login for the owner, the token's name, or the CMS itself. */
function actorName(actor: string) {
  if (actor.startsWith("github:")) return `@${actor.slice("github:".length)}`;
  if (actor.startsWith("token:")) return actor.slice("token:".length);
  return { scheduler: "the scheduler", import: "the import", "cms:token": "the server console" }[actor] ?? actor;
}

function HistoryAvatar({ entry }: { entry: AuditEntry }) {
  const name = actorName(entry.actor);
  const system = !entry.actor.includes(":") || entry.actor === "cms:token";
  return (
    <div className="relative shrink-0">
      <Avatar className="size-10" initials={system ? undefined : name.replace(/^@/, "").slice(0, 2).toUpperCase()} colorSeed={entry.actorTokenId ?? entry.actor} />
      <div className="absolute -right-1 -bottom-1 z-30 flex items-center justify-center rounded-full border border-border-default bg-background p-1 shadow-sm [&_svg]:size-3">
        {actions[entry.action].icon}
      </div>
    </div>
  );
}

function Subject({ entry, onNavigate }: { entry: AuditEntry; onNavigate: () => void }) {
  // A deleted post has no page to open; its entries keep the name it had.
  if (!entry.postId || entry.action === "post.deleted") return <>{entry.subject}</>;
  return (
    <Link to="/posts/$id" params={{ id: entry.postId }} onClick={onNavigate} className="font-medium text-foreground underline-offset-4 hover:underline">
      {entry.subject}
    </Link>
  );
}

const areas: Array<{ value: "all" | ListAuditArea; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "posts", label: "Posts" },
  { value: "access", label: "Tokens & sign-ins" },
];

/** The log, opened from the History card under Advanced (settings-page.tsx). */
export function HistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [area, setArea] = useState<"all" | ListAuditArea>("all");
  const log = useInfiniteQuery({
    queryKey: ["/v1/audit", "history", area],
    enabled: open,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await listAudit({ limit: pageSize, cursor: pageParam, area: area === "all" ? undefined : area });
      if (response.status !== 200) throw new Error("The history could not be loaded.");
      return response.data;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const entries = log.data?.pages.flatMap((page) => page.entries) ?? [];

  // Loads the next page when the end of the list scrolls into view, as Ghost's InfiniteScrollListener.
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
  useEffect(() => {
    const element = end.current;
    if (!element || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "250px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, entries.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh sm:max-w-2xl" data-testid="history-modal">
        <DialogHeader className="flex-row items-center justify-between gap-4 border-b border-border-default px-8 pt-8 pb-5 text-left max-sm:px-6 max-sm:pt-6">
          <div className="space-y-1">
            <DialogTitle>History</DialogTitle>
            <DialogDescription>Who or which token changed what, and when.</DialogDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" aria-label="Filter history" data-testid="history-filter"><ListFilter />{areas.find((item) => item.value === area)!.label}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Show</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={area} onValueChange={(value) => setArea(value as typeof area)}>
                {areas.map((item) => <DropdownMenuRadioItem key={item.value} value={item.value}>{item.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-6 max-sm:px-6">
          {log.isPending ? (
            <div className="flex h-64 items-center justify-center"><LoadingIndicator size="lg" /></div>
          ) : log.isError ? (
            <p className="py-10 text-center text-muted-foreground">The history could not be loaded. Try again in a moment.</p>
          ) : !entries.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground [&_svg]:size-8">
              <HistoryIcon />
              {area === "all" ? "No history entries yet." : "No entries match this filter."}
            </div>
          ) : (
            <ActionList aria-label="History">
              {entries.map((entry) => (
                <ActionListItem key={entry.id} data-testid="history-entry">
                  <ActionListItemContent className="flex w-full items-center gap-3 py-3">
                    <HistoryAvatar entry={entry} />
                    <div className="min-w-0 grow">
                      <div className="break-words">
                        {actions[entry.action].title}: <Subject entry={entry} onNavigate={() => onOpenChange(false)} />
                        <span className="text-muted-foreground"> by {actorName(entry.actor)}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">{format(new Date(entry.at), "d MMM yyyy | HH:mm:ss")}</div>
                    </div>
                  </ActionListItemContent>
                </ActionListItem>
              ))}
              <div ref={end} />
              {isFetchingNextPage && <div className="flex justify-center p-5"><LoadingIndicator size="md" /></div>}
              {!hasNextPage && <div className="border-t border-border-default pt-2 text-sm text-muted-foreground">End of history log</div>}
            </ActionList>
          )}
        </div>
        {/* Ghost's sticky footer: on a phone the dialog fills the screen, so this is the way out. */}
        <DialogFooter className="border-t border-border-default px-8 py-4 max-sm:px-6">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
