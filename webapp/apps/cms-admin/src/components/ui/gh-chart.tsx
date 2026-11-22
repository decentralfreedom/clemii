// From Shade, Ghost Admin's design system (TryGhost/Ghost apps/shade/src, c2617d08),
// MIT License, Copyright (c) 2013-2026 Ghost Foundation (see packages/theme/LICENSE.ghost).
// Changed for search numbers: a point's value may be null (a day without
// impressions has no CTR or position: a gap, never 0), and yAxisReversed puts
// rank 1 at the top of a position chart, and showDots draws each point, so a
// day between gaps is seen rather than lost.
import {
  calculateYAxisWidth,
  formatDisplayDateWithRange,
  formatNumber,
  getYRange,
} from '@/lib/chart-utils';
import { cn } from '@/lib/utils';
import React from 'react';
import { AlignedAxisTick, ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useShade } from '@/providers/shade-context';

// A Ghost specific charts for analytics re-using ShadCN/UI and Recharts components

interface TooltipPayload {
  value: number;
  payload: {
    date?: string;
    formattedValue?: string;
    label?: string;
    diffValue?: null | number;
    formattedDiffValue?: null | string;
  };
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  range?: number;
  showHours?: boolean;
  color?: string;
}

const GhCustomTooltipContent = ({ active, payload, range, showHours, color }: TooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const { date, formattedValue, label, diffValue, formattedDiffValue } = payload[0].payload;
  const displayValue = formattedValue || payload[0].value;

  return (
    <div className="min-w-[120px] rounded-lg border bg-background px-3 py-2 shadow-lg">
      {date && (
        <div className="text-sm text-foreground">
          {formatDisplayDateWithRange(date, range || 0, showHours)}
        </div>
      )}
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 inline-block size-2 rounded-full opacity-50"
          style={{ backgroundColor: color || 'var(--chart-blue)' }}
        ></span>
        <div className="flex grow items-start justify-between gap-5">
          {label && <div className="text-sm text-muted-foreground">{label}</div>}
          <div className="flex flex-col items-end font-mono font-medium">
            {displayValue}

            {diffValue ? (
              diffValue < 0 && (
                <div className="flex items-center gap-0.5 text-state-danger">
                  <TrendingDown size={14} strokeWidth={1.5} />
                  <span>{formattedDiffValue}</span>
                </div>
              )
            ) : (
              <></>
            )}
            {diffValue ? (
              diffValue > 0 && (
                <div className="flex items-center gap-0.5 text-state-success">
                  <TrendingUp size={14} strokeWidth={1.5} />
                  <span>{formattedDiffValue}</span>
                </div>
              )
            ) : (
              <></>
            )}
            {/* {diffValue !== undefined ? diffValue === 0 && (
                            <span>&mdash;</span>
                        ) : <></>} */}
          </div>
        </div>
      </div>
    </div>
  );
};

export type GhAreaChartDataItem = {
  date: string;
  value: number | null;
  formattedValue: string;
  label: string;
};

interface GhAreaChartProps {
  data: GhAreaChartDataItem[];
  /** Puts the lowest value at the top, as a position chart reads (rank 1 is best). */
  yAxisReversed?: boolean;
  /** Draws every point: a series with gaps would otherwise hide a day between two of them. */
  showDots?: boolean;
  range: number;
  yAxisRange?: [number, number];
  color?: string;
  id: string;
  className?: string;
  syncId?: string;
  allowDataOverflow?: boolean;
  showYAxisValues?: boolean;
  showHorizontalLines?: boolean;
  dataFormatter?: (value: number) => string;
  showHours?: boolean;
  tooltipContent?: React.ReactElement;
}

const GhAreaChart: React.FC<GhAreaChartProps> = ({
  data,
  range,
  yAxisRange,
  color = 'var(--chart-blue)',
  id,
  className,
  syncId,
  allowDataOverflow = false,
  showYAxisValues = true,
  showHorizontalLines = true,
  dataFormatter = formatNumber,
  showHours = false,
  tooltipContent,
  yAxisReversed = false,
  showDots = false,
}) => {
  const { admin7Design } = useShade();
  // Empty points (null) are gaps and take no part in the scale.
  const present = data.filter((item): item is GhAreaChartDataItem & { value: number } => item.value !== null);
  const yRange = yAxisRange || [getYRange(present).min, getYRange(present).max];
  const chartConfig = {
    value: {
      label: data[0]?.label || 'Value',
    },
  } satisfies ChartConfig;

  // Use yRange as domain and set baseValue to the minimum (the bottom: the maximum when reversed)
  const baseValue = yAxisReversed ? yRange[1] : yRange[0];

  // Calculate midpoint and create ticks array
  const midValue = (yRange[0] + yRange[1]) / 2;
  const isWholeMid = Number.isInteger(midValue);
  const yTicks = isWholeMid ? [yRange[0], midValue, yRange[1]] : yRange;

  const xTickHoursOnly = showHours && range === 1;
  const xTicks = data.length > 0 ? [...new Set([data[0].date, data[data.length - 1].date])] : [];

  return (
    <ChartContainer className={cn('w-full', className)} config={chartConfig}>
      <AreaChart
        data={data}
        margin={{
          left: 4,
          right: 4,
          top: showHorizontalLines ? 24 : 4,
        }}
        syncId={syncId}
      >
        <CartesianGrid horizontal={showHorizontalLines} stroke="var(--border)" vertical={false} />
        <XAxis
          axisLine={{ stroke: 'var(--border)', strokeWidth: 1 }}
          dataKey="date"
          interval={0}
          tick={(props) => (
            <AlignedAxisTick
              {...props}
              formatter={(value) =>
                formatDisplayDateWithRange(String(value), range, showHours, xTickHoursOnly)
              }
              textAnchor={xTicks.length === 1 ? 'middle' : undefined}
            />
          )}
          tickFormatter={(value) => formatDisplayDateWithRange(String(value), range, showHours)}
          tickLine={false}
          tickMargin={10}
          ticks={xTicks}
        />
        <YAxis
          allowDataOverflow={allowDataOverflow}
          axisLine={false}
          domain={allowDataOverflow ? undefined : yRange}
          reversed={yAxisReversed}
          scale="linear"
          tickFormatter={(value: number) => {
            return dataFormatter(value);
          }}
          tickLine={false}
          ticks={yTicks}
          width={showYAxisValues ? calculateYAxisWidth(yRange, dataFormatter) : 0}
        />
        <ChartTooltip
          content={
            tooltipContent || (
              <GhCustomTooltipContent color={color} range={range} showHours={showHours} />
            )
          }
          cursor={true}
          isAnimationActive={false}
          position={{ y: 10 }}
        />
        <defs>
          <linearGradient id={`fillChart-${id}`} x1="0" x2="0" y1="0" y2="1">
            {/* admin7Design charts are flat: an even tint under the line. */}
            <stop offset="5%" stopColor={color} stopOpacity={admin7Design ? 0.5 : 0.8} />
            <stop offset="95%" stopColor={color} stopOpacity={admin7Design ? 0.5 : 0.1} />
          </linearGradient>
        </defs>
        <Area
          baseValue={baseValue}
          dataKey="value"
          dot={showDots ? { r: 3, fill: color, stroke: color, strokeWidth: 0, fillOpacity: 1 } : false}
          fill={`url(#fillChart-${id})`}
          fillOpacity={0.2}
          isAnimationActive={false}
          stroke={color}
          strokeWidth={1.5}
          type="linear"
        />
      </AreaChart>
    </ChartContainer>
  );
};

export { GhAreaChart, GhCustomTooltipContent };

export type { TooltipProps };
