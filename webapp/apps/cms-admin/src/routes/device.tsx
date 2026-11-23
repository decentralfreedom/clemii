// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// Connects a device, as github.com/login/device does for `gh auth login`: the
// owner checks the code the CLI shows, sees what it asks for and authorizes or
// denies it (the CMS's routes/device.ts). On the sign-in card (auth-card.tsx).
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { decideDeviceSignIn, getDeviceSignIn, type PendingDeviceSignIn } from "@/api/cms.generated";
import { CmsError } from "@/api/fetcher";
import { requireSession } from "@/api/require-session";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

export const Route = createFileRoute("/device")({
  validateSearch: (search: Record<string, unknown>): { code?: string } => (typeof search.code === "string" ? { code: search.code } : {}),
  beforeLoad: requireSession,
  component: DevicePage,
});

const scopeText: Record<string, string> = {
  "posts:read": "Read every post",
  "posts:write": "Write and change drafts",
  "posts:publish": "Schedule or publish posts you have approved",
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <AuthCard title={title}>{children}</AuthCard>;
}

function DevicePage() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const [decided, setDecided] = useState<"approve" | "deny">();
  const pending = useQuery({
    queryKey: ["device-sign-in", code],
    queryFn: async () => (await getDeviceSignIn(code!)).data as PendingDeviceSignIn,
    enabled: Boolean(code) && !decided,
    retry: false,
  });
  const decide = useMutation({
    mutationFn: (decision: "approve" | "deny") => decideDeviceSignIn(code!, decision),
    onSuccess: (_, decision) => setDecided(decision),
  });

  if (decided === "approve") {
    return (
      <Card title="Device connected">
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 size-4 shrink-0 text-state-success" />You can close this window and return to your terminal.</p>
      </Card>
    );
  }
  if (decided === "deny") {
    return (
      <Card title="Access denied">
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground"><X className="mt-0.5 size-4 shrink-0" />The device was not connected. You can close this window.</p>
      </Card>
    );
  }
  if (!code || (pending.error instanceof CmsError && pending.error.status === 404)) {
    return (
      <Card title="Connect a device">
        <CodeForm missing={Boolean(code)} onSubmit={(value) => void navigate({ to: "/device", search: { code: value } })} />
      </Card>
    );
  }
  if (!pending.data) {
    return (
      <Card title="Connect a device">
        {pending.error
          ? <p role="alert" className="mt-2 text-sm text-destructive">{pending.error instanceof CmsError ? pending.error.message : "The CMS could not be reached."}</p>
          : <div role="status" aria-label="Loading" className="mt-8 flex justify-center"><LoadingIndicator size="md" /></div>}
      </Card>
    );
  }
  const request = pending.data;
  return (
    <Card title="Authorize hush-cms">
      <p className="mt-2 text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{request.clientName}</strong> asks to access the clemii CMS. It will be able to:</p>
      <ul className="mt-4 grid gap-2 text-sm">
        {request.scopes.map((scope) => <li key={scope} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-state-success" />{scopeText[scope] ?? scope}</li>)}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">Its access lasts {request.tokenDays} days. Authorize only if your terminal shows this code:</p>
      <p className="mt-3 rounded-md border border-border-default bg-background/60 py-3 text-center font-mono text-xl font-semibold tracking-[0.2em]" aria-label="Code">{request.userCode}</p>
      {decide.error && <p role="alert" className="mt-4 text-sm text-destructive">{decide.error instanceof CmsError ? decide.error.message : "Something went wrong."}</p>}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <Button size="lg" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate("deny")}>Deny</Button>
        <Button size="lg" disabled={decide.isPending} onClick={() => decide.mutate("approve")}>Authorize</Button>
      </div>
    </Card>
  );
}

/** For a code typed by hand, or one that is not waiting (mistyped, expired or already used). */
function CodeForm({ missing, onSubmit }: { missing: boolean; onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim().toUpperCase());
  };
  return (
    <form onSubmit={submit} className="-mt-4">
      {/* Under the title, as Ghost's AuthHeader carries its line. */}
      <p className="text-center text-lg text-pretty text-muted-foreground">
        {missing ? "That code is not waiting for approval. It may be mistyped, expired or already used." : "Enter the code shown in your terminal."}
      </p>
      <div className="mt-6 grid gap-1.5">
        <Label htmlFor="device-code">Code</Label>
        <Input id="device-code" autoFocus autoComplete="off" spellCheck={false} placeholder="BCDF-GHJK" value={value} onChange={(event) => setValue(event.target.value)} className="font-mono uppercase" />
      </div>
      <Button type="submit" size="lg" className="mt-6 h-(--control-height) w-full" disabled={!value.trim()}>Continue</Button>
    </form>
  );
}
