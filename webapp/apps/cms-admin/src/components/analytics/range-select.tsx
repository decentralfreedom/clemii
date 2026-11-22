// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
//
// The date range of an analytics page, as Ghost's DateRangeSelect
// (apps/admin/src/shared/analytics/date-range-select.tsx).
import { CalendarDays } from "lucide-react";
import { analyticsRanges, type AnalyticsRangeKey } from "@/lib/analytics-ranges";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function RangeSelect({ value, onChange }: { value: AnalyticsRangeKey; onChange: (value: AnalyticsRangeKey) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AnalyticsRangeKey)}>
      <SelectTrigger aria-label="Date range" shape="pill" variant="ghost" className="w-auto gap-1.5 font-medium [&_svg]:size-4">
        <CalendarDays className="size-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {analyticsRanges.map((range) => <SelectItem key={range.key} value={range.key}>{range.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
