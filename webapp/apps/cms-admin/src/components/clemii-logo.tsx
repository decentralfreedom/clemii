// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import { cn } from "@/lib/utils";
import mark from "@/assets/clemii-mark.svg";

/** The clemii mark (the website's, drawn by its scripts/gen-clemii-mark.ts) and name. */
export function ClemiiLogo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img src={mark} alt="" aria-hidden="true" className="size-7 shrink-0" />
      {withName && <span className="text-[15px] font-semibold tracking-[-0.01em]">clemii</span>}
    </span>
  );
}
