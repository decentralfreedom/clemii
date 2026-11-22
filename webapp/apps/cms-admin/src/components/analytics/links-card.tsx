// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Tracked links (PRD: tracked links): the links we share, each with its page
// views and downloads, and a builder that makes a new one from fixed choices,
// so a typo can never split one source into two rows. The CMS checks and
// stores the link (cms src/links/service.ts); this only offers the choices.
import { useQueryClient } from "@tanstack/react-query";
import { Archive, CopyIcon, Link2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { blogPath, type BlogLanguage } from "@hush/article/taxonomy";
import {
  getListLinksQueryKey, useArchiveLink, useCreateLink, useListLinks, useListPosts,
  type GetTrafficSourcesParams, type NewTrackedLinkSharedOn, type TrackedLink,
} from "@/api/cms.generated";
import { CmsError } from "@/api/fetcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The places a link can be shared, as the CMS offers them, and whether they name who shares it. */
const places: Array<{ value: NewTrackedLinkSharedOn; label: string; who?: string }> = [
  { value: "reddit", label: "Reddit" }, { value: "linkedin", label: "LinkedIn" }, { value: "x", label: "X" },
  { value: "hackernews", label: "Hacker News" }, { value: "bluesky", label: "Bluesky" }, { value: "youtube", label: "YouTube" },
  { value: "newsletter", label: "Our newsletter" }, { value: "email", label: "An email" },
  { value: "creator", label: "A creator", who: "Their name, e.g. creator-anna" },
  { value: "partner", label: "A partner site", who: "Its name, e.g. macstories" },
  { value: "ad", label: "A paid ad", who: "The platform, e.g. reddit-ads" },
];
const tag = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const number = new Intl.NumberFormat("en");

function copy(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success("Link copied");
}

const shareable = (link: TrackedLink) => link.url ?? `${link.path}${link.query}`;

function NewLinkDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const posts = useListPosts({ status: "published" });
  const published = posts.data?.status === 200 ? posts.data.data.posts : [];
  const [path, setPath] = useState("/");
  const [place, setPlace] = useState<NewTrackedLinkSharedOn>("reddit");
  const [who, setWho] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [made, setMade] = useState<TrackedLink>();
  const create = useCreateLink();
  const needsWho = places.find((option) => option.value === place)?.who;
  const problems = [
    needsWho && !tag.test(who) ? "Name who shares it: lowercase words joined by hyphens." : "",
    !tag.test(campaign) ? "Name the campaign: lowercase words joined by hyphens, e.g. launch-2026-12." : "",
    content && !tag.test(content) ? "The content tag: lowercase words joined by hyphens." : "",
  ].filter(Boolean);
  const reset = () => { setWho(""); setCampaign(""); setContent(""); setName(""); setMade(undefined); };
  const submit = async () => {
    try {
      const answer = await create.mutateAsync({ data: {
        name: name || `${places.find((option) => option.value === place)!.label}: ${campaign}`, path, sharedOn: place, campaign,
        ...(needsWho ? { who } : {}), ...(content ? { content } : {}),
      } });
      if (answer.status !== 201) throw new Error("The CMS did not make the link.");
      setMade(answer.data);
      await queryClient.invalidateQueries({ queryKey: getListLinksQueryKey().slice(0, 1) });
    } catch (error) {
      toast.error(error instanceof CmsError ? error.message : "The link could not be made.");
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{made ? "Your link" : "New tracked link"}</DialogTitle>
          <DialogDescription>{made ? "Share this link where you said; its visits and downloads count on its own row." : "Pick the page and where you will share it. The campaign tags follow from your choices."}</DialogDescription>
        </DialogHeader>
        {made ? (
          <div className="flex items-center gap-2 rounded-md border border-border-default p-3">
            <code className="min-w-0 flex-1 break-all text-sm" data-testid="new-link">{shareable(made)}</code>
            <Button variant="outline" size="sm" onClick={() => copy(shareable(made))}><CopyIcon />Copy</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="link-page">Page</Label>
              <Select value={path} onValueChange={setPath}>
                <SelectTrigger id="link-page" aria-label="Page"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="/">Home</SelectItem>
                  {published.map((post) => {
                    const destination = blogPath(post.lang as BlogLanguage, post.slug);
                    // Two posts can share a title; the address tells them apart.
                    return <SelectItem key={post.id} value={destination}>{post.title} <span className="text-text-secondary">{destination}</span></SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-place">Shared on</Label>
              <Select value={place} onValueChange={(value) => setPlace(value as NewTrackedLinkSharedOn)}>
                <SelectTrigger id="link-place" aria-label="Shared on"><SelectValue /></SelectTrigger>
                <SelectContent>{places.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {needsWho && (
              <div className="grid gap-1.5">
                <Label htmlFor="link-who">Who</Label>
                <Input id="link-who" value={who} onChange={(event) => setWho(event.target.value.toLowerCase())} placeholder={needsWho} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="link-campaign">Campaign</Label>
              <Input id="link-campaign" value={campaign} onChange={(event) => setCampaign(event.target.value.toLowerCase())} placeholder="launch-2026-12" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-content">Content tag (optional)</Label>
              <Input id="link-content" value={content} onChange={(event) => setContent(event.target.value.toLowerCase())} placeholder="Tells two links in one campaign apart, e.g. comment-reply" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="link-name">Name (optional)</Label>
              <Input id="link-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="What it is for, e.g. r/macapps launch post" />
            </div>
            {problems.length > 0 && campaign !== "" && <p className="text-sm text-destructive">{problems[0]}</p>}
          </div>
        )}
        <DialogFooter>
          {made ? (
            <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
          ) : (
            <Button disabled={problems.length > 0 || create.isPending} onClick={() => void submit()}><Link2 />Make link</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LinksCard({ params }: { params: Pick<GetTrafficSourcesParams, "days" | "since"> }) {
  const [open, setOpen] = useState(false);
  const links = useListLinks(params);
  const archive = useArchiveLink();
  const queryClient = useQueryClient();
  const rows = links.data?.status === 200 ? links.data.data.links : [];
  return (
    <Card data-testid="links-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Tracked links</CardTitle>
          <CardDescription>The links you share, each counted on its own: page views on its page, and the downloads they started.</CardDescription>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}><Plus />New link</Button>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="text-sm text-text-secondary">{links.isPending ? "Loading…" : "No tracked links yet. Make one for the next post you share on Reddit, LinkedIn or in the newsletter."}</p>
        ) : (
          <Table aria-label="Tracked links">
            <TableHeader>
              <TableRow>
                <TableHead>Link</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Page views</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Downloads</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((link) => (
                <TableRow key={link.id}>
                  {/* w-full with max-w-0 lets the cell take the free width and truncate within it. */}
                  <TableCell className="w-full max-w-0 whitespace-normal">
                    <span className="font-medium">{link.name}</span>
                    <span className="block truncate text-xs text-text-secondary" title={shareable(link)}>{link.path} · {link.source} · {link.medium} · {link.campaign}{link.content ? ` · ${link.content}` : ""}</span>
                    {/* On a phone the numbers sit under the name, so the row fits. */}
                    <span className="mt-1 block text-xs tabular-nums sm:hidden">{number.format(link.pageviews)} page views · {number.format(link.downloads)} downloads</span>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{number.format(link.pageviews)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{number.format(link.downloads)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Copy ${link.name}`} onClick={() => copy(shareable(link))}><CopyIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Archive ${link.name}`} title="Archive: its numbers stay" onClick={() => void archive.mutateAsync({ id: link.id }).then(() => queryClient.invalidateQueries({ queryKey: getListLinksQueryKey().slice(0, 1) }))}><Archive /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <NewLinkDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}
