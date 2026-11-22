// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import { createFileRoute } from "@tanstack/react-router";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sign-in")({
  // Where to return after GitHub; the CMS accepts only its own paths (routes/auth.ts).
  validateSearch: (search: Record<string, unknown>): { next?: string } => (typeof search.next === "string" ? { next: search.next } : {}),
  component: SignIn,
});

/** GitHub's mark, as its brand guidelines show it beside "Sign in with GitHub". */
function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function SignIn() {
  const { next } = Route.useSearch();
  return (
    <AuthCard title="Sign in to the CMS" description="Write, schedule and publish the hush blog.">
      {/* Ghost's SubmitButton: the full width, at the auth screens' larger control height. */}
      <Button asChild size="lg" className="mt-4 h-(--control-height) w-full [&_svg]:size-5">
        {/* A full navigation: GitHub redirects back to /auth/github/callback. */}
        <a href={next ? `/auth/github?next=${encodeURIComponent(next)}` : "/auth/github"}><GitHubMark />Sign in with GitHub</a>
      </Button>
      {/* Ghost's FlowMessage line under the form. */}
      <p className="mt-6 text-center text-base text-muted-foreground">Only the owner's GitHub account can sign in.</p>
    </AuthCard>
  );
}
