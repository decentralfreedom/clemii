// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A published post's cover, as Ghost shows a post's feature image, over its
// placeholder (Ghost's shared/feature-image-placeholder.tsx). The site renders the
// cover when it builds, a minute or two after publishing, so a cover that is not
// there yet is asked for again until it is, and fades in without a reload.
import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** How often, and how long, to ask again for a cover the site has not built yet. */
export const coverRetry = { everyMs: 15_000, attempts: 20 };

export function PostCover({ src, className }: { src: string | null; className?: string }) {
  const [state, setState] = useState({ src, attempt: 0, loaded: false, missing: false });
  // A new address starts over, as a new post would.
  const current = state.src === src ? state : { src, attempt: 0, loaded: false, missing: false };
  if (current !== state) setState(current);

  useEffect(() => {
    if (!current.missing || current.attempt + 1 >= coverRetry.attempts) return;
    const timer = setTimeout(() => setState((value) => ({ ...value, attempt: value.attempt + 1, missing: false })), coverRetry.everyMs);
    return () => clearTimeout(timer);
  }, [current.missing, current.attempt]);

  return (
    <span aria-hidden className={cn("relative flex items-center justify-center overflow-hidden bg-muted", className)}>
      <ImageIcon size={18} className="text-muted-foreground/50" />
      {src && !current.missing && (
        <img
          key={current.attempt} src={src} alt="" width={800} height={420} loading="lazy" decoding="async"
          onLoad={() => setState((value) => ({ ...value, loaded: true }))}
          onError={() => setState((value) => ({ ...value, missing: true }))}
          className={cn("absolute inset-0 size-full object-cover object-left transition-opacity duration-300", current.loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </span>
  );
}
