// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// A ranked list with each row's share drawn as a bar behind it, the pattern
// of Ghost's top content and Tremor's BarList (rebuilt here, no code copied):
// the longest bar is the first row, the rest in proportion, so the ranking
// reads at a glance and the exact number stays on the right.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BarListRow = {
  key: string;
  label: ReactNode;
  value: number;
  /** A second number after the main one, e.g. downloads. */
  detail?: ReactNode;
  /** Makes the row a button, e.g. to filter by it. */
  onSelect?: () => void;
  /** Says what selecting the row does, for screen readers. */
  actionLabel?: string;
};

const number = new Intl.NumberFormat("en");

export function BarList({ rows, valueLabel, detailLabel, ariaLabel }: { rows: BarListRow[]; valueLabel: string; detailLabel?: string; ariaLabel: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  // One grid for the header and every row, so the columns line up and the name takes all the free width.
  const grid = cn("grid items-center gap-3 px-2", detailLabel ? "grid-cols-[minmax(0,1fr)_5rem_5rem]" : "grid-cols-[minmax(0,1fr)_5rem]");
  return (
    <div role="table" aria-label={ariaLabel} className="flex flex-col gap-1 text-sm">
      <div role="row" className={cn(grid, "pb-1 text-xs text-text-secondary")}>
        <span role="columnheader">Name</span>
        <span role="columnheader" className="whitespace-nowrap text-right">{valueLabel}</span>
        {detailLabel && <span role="columnheader" className="whitespace-nowrap text-right">{detailLabel}</span>}
      </div>
      {rows.map((row) => (
        <div key={row.key} role="row" className={cn(grid, "relative h-9 rounded-md", row.onSelect && "hover:bg-muted")}>
          <span aria-hidden className="absolute inset-y-0 left-0 rounded-md bg-[var(--chart-blue)] opacity-15 transition-[width] motion-reduce:transition-none" style={{ width: `${(row.value / max) * 100}%` }} />
          <span role="cell" className="relative min-w-0 truncate">
            {row.onSelect ? (
              // The whole row is the button's target, the cell keeps its role.
              <button type="button" aria-label={row.actionLabel} onClick={row.onSelect} className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-2">{row.label}</button>
            ) : row.label}
          </span>
          <span role="cell" className="relative text-right font-medium tabular-nums">{number.format(row.value)}</span>
          {detailLabel && <span role="cell" className="relative text-right text-text-secondary tabular-nums">{row.detail}</span>}
        </div>
      ))}
    </div>
  );
}
