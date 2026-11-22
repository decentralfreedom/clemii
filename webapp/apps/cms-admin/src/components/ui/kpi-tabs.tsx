// From Shade, Ghost Admin's design system (TryGhost/Ghost apps/shade/src, c2617d08),
// MIT License, Copyright (c) 2013-2026 Ghost Foundation (see packages/theme/LICENSE.ghost).
// Changed: the icon is passed as a component, not looked up by name, which
// pulled every Lucide icon into the bundle.
import * as React from 'react';
import { type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button, ButtonProps } from '@/components/ui/button';
import { MetricValue } from '@/components/ui/metric-value';
import { TabsTrigger } from '@/components/ui/tabs';
import { TrendBadge } from '@/components/ui/trend-badge';

interface KpiTabTriggerProps extends React.ComponentProps<typeof TabsTrigger> {
  children: React.ReactNode;
}

const KpiTabTrigger: React.FC<KpiTabTriggerProps> = ({ children, ...props }) => {
  return (
    <TabsTrigger className="h-auto" {...props}>
      {children}
    </TabsTrigger>
  );
};

interface KpiTabValueProps {
  color?: string;
  icon?: LucideIcon;
  label: string;
  value: string | number;
  diffDirection?: 'up' | 'down' | 'same' | 'hidden';
  diffValue?: string | number;
  className?: string;
  'data-testid'?: string;
}

const KpiTabValue: React.FC<KpiTabValueProps> = ({
  color,
  icon: IconComponent,
  label,
  value,
  diffDirection,
  diffValue,
  className,
  'data-testid': testId,
}) => {
  const labelNode = (
    <span
      className="flex items-center gap-1.5 transition-all group-hover:text-foreground"
      data-type="value"
    >
      {color && (
        <div
          className="ml-1 size-2 rounded-full opacity-50"
          style={{ backgroundColor: color }}
        ></div>
      )}
      {IconComponent && <IconComponent size={16} strokeWidth={1.5} />}
      {label}
    </span>
  );

  const trailing =
    diffDirection && diffDirection !== 'hidden' ? (
      <TrendBadge
        className="mt-0.5"
        data-testid={testId ? `${testId}-diff` : undefined}
        direction={diffDirection}
        value={diffValue ?? ''}
      />
    ) : null;

  return (
    <MetricValue
      className={cn('group', className)}
      label={labelNode}
      size="lg"
      trailing={trailing}
      value={value}
      valueTestId={testId}
    />
  );
};

interface KpiDropdownButtonProps extends ButtonProps {
  className?: string;
  children: React.ReactNode;
}

const KpiDropdownButton = React.forwardRef<HTMLButtonElement, KpiDropdownButtonProps>(
  ({ variant = 'dropdown', className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(
          'h-auto w-full rounded-none border-x-0 border-t-0 bg-transparent py-5 focus-visible:ring-0',
          className,
        )}
        variant={variant}
        {...props}
      />
    );
  },
);
KpiDropdownButton.displayName = 'KpiDropdownButton';

export { KpiTabTrigger, KpiTabValue, KpiDropdownButton };
