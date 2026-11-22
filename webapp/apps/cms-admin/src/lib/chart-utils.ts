// The chart helpers Shade's GhAreaChart (components/ui/gh-chart.tsx) uses.
// formatNumber, getYRange and calculateYAxisWidth come from Shade's
// lib/ds-utils.ts (TryGhost/Ghost apps/shade/src, c2617d08), MIT License,
// Copyright (c) 2013-2026 Ghost Foundation (see packages/theme/LICENSE.ghost).
// formatDisplayDateWithRange keeps Shade's labels but reads a YYYY-MM-DD day
// as that day: Search Console's days are US Pacific, and shifting them into
// the browser's time zone, as Shade's does, could show the wrong day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Add thousands indicator to numbers
export const formatNumber = (
  value: number,
  options?: Pick<Intl.NumberFormatOptions, 'minimumFractionDigits' | 'maximumFractionDigits'>,
): string => {
  if (isNaN(value) || !isFinite(value)) {
    return '0';
  }

  const formattedValue = options ? value : Math.round(value);
  return new Intl.NumberFormat('en-US', options).format(formattedValue);
};

export const getYRange = (data: { value: number }[]): { min: number; max: number } => {
  if (!data.length) {
    return { min: 0, max: 1 };
  }

  const values = data.map((d) => Number(d.value));
  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const value = min;
    return { min: Math.max(0, value - 1), max: value + 1 };
  }

  // Use a percentage-based padding (10% of the range)
  const padding = 0.02;

  // Add padding and ensure min is not negative
  min = Math.max(0, min - min * padding);
  max = max + max * padding;

  const range = max - min;

  // Determine the order of magnitude for rounding based on the range
  const rangeMagnitude = Math.floor(Math.log10(range));
  // Always round to at least 10s, but use larger steps for bigger ranges
  // const roundTo = Math.max(10, Math.pow(10, rangeMagnitude));
  const roundTo = Math.pow(10, rangeMagnitude);

  // Round min and max to the appropriate precision
  const roundedMax = Math.round(max / roundTo) * roundTo;
  max = roundedMax < max ? Math.ceil(max / roundTo) * roundTo : roundedMax;

  const roundedMin = Math.round(min / roundTo) * roundTo;
  min = roundedMin > min ? Math.floor(min / roundTo) * roundTo : roundedMin;
  min = Math.max(0, min);

  // Ensure we have a visible range even after rounding
  if (min === max) {
    const midPoint = (min + max) / 2;
    const smallRange = Math.max(Math.abs(midPoint) * padding, roundTo);
    min = Math.max(0, Math.floor(midPoint - smallRange));
    max = Math.ceil(midPoint + smallRange);
  }

  // Final safety check to ensure min is never negative
  min = Math.max(0, min);

  return { min, max };
};

// Calculates the width needed for the Y-axis based on the formatted tick values
export const calculateYAxisWidth = (
  ticks: number[],
  formatter: (value: number) => string,
): number => {
  if (!ticks.length) {
    return 40;
  }

  // Get the longest formatted tick value
  const maxFormattedLength = Math.max(...ticks.map((tick) => formatter(tick).length));

  // Approximate width based on character count (assuming monospace font)
  // Add padding for safety
  const width = Math.max(20, maxFormattedLength * 8 + 20);
  return width;
};

/**
 * A day's label for a chart spanning `range` days, as Shade's: month and year
 * from a year on, "Week of" from 90 days, else the day.
 */
// Search Console has no hours, so Shade's hourly labels (its last two parameters) never apply.
export const formatDisplayDateWithRange = (date: string, range: number, _showHours = false, _hoursOnly = false): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return "";
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (range >= 365) return `${monthName} ${year}`;
  const label = `${Number(day)} ${monthName}`;
  return range >= 90 ? `Week of ${label}` : label;
};
