// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The page the owner meets before the admin: signing in and connecting a
// device. Laid out as Ghost Admin's auth screens (apps/admin/src/auth/
// auth-layout.tsx: AuthLayout, AuthHeader): one centred column on the sidebar
// colour, the icon over a large title, larger controls. Under it the hush
// mark's waveform runs along the bottom of the page, breathing slowly as if it
// listened, fading out before the text; still under Reduce Motion. Every colour
// is a theme token, so light and dark both hold.
import type { ReactNode } from "react";

// Bar heights along the wave, in percent: the logo's four bars repeated with a
// swell towards the middle, so it reads as a voice rather than a pattern.
const bars = Array.from({ length: 56 }, (_, index) => {
  const swell = Math.sin((index / 55) * Math.PI);
  const logo = [34, 100, 60, 24][index % 4]!;
  return Math.round(10 + logo * (0.2 + 0.8 * swell) * 0.85);
});

function Waveform() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex h-[30vh] items-end justify-center gap-[clamp(3px,0.9vw,12px)] overflow-hidden px-4 pb-[6vh] opacity-[0.09] [mask-image:linear-gradient(to_top,black_30%,transparent_85%)] dark:opacity-[0.12]"
    >
      {bars.map((height, index) => (
        <span
          key={index}
          className="auth-wave-bar w-[clamp(2px,0.55vw,8px)] shrink-0 rounded-full bg-foreground"
          style={{ height: `${height}%`, animationDelay: `${(index % 14) * -0.3}s` }}
        />
      ))}
    </div>
  );
}

/** The hush mark at Ghost's site-icon size, outlined so its dark tile holds on a dark page. */
function HushMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="size-15 rounded-[14px] dark:ring-1 dark:ring-white/15">
      <rect width="64" height="64" rx="15" ry="15" fill="#1F201E" />
      <g fill="none" stroke="#F8F8F6" strokeWidth="7" strokeLinecap="round">
        <path d="M14.75 25.2v13.6" /><path d="M26.25 12v40" /><path d="M37.75 20v24" /><path d="M49.25 27.2v9.6" />
      </g>
    </svg>
  );
}

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh w-full flex-col items-center overflow-hidden bg-sidebar px-6 text-foreground [--control-height:var(--control-height-lg)] [&_input]:text-control-lg">
      <Waveform />
      <div className="my-auto w-full max-w-[400px] py-12">
        <header className="mb-8 flex flex-col items-center gap-5 text-center">
          <HushMark />
          <h1 className="text-4xl leading-tight font-bold tracking-tighter text-balance">{title}</h1>
          {description && <p className="text-lg text-muted-foreground">{description}</p>}
        </header>
        {children}
      </div>
    </main>
  );
}
