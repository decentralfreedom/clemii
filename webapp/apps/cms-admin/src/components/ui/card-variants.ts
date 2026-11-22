// From Shade, Ghost Admin's design system (TryGhost/Ghost apps/shade/src, c2617d08),
// MIT License, Copyright (c) 2013-2026 Ghost Foundation (see packages/theme/LICENSE.ghost).
import { cva } from 'class-variance-authority';

const cardVariants = cva('flex flex-col bg-card text-card-foreground', {
  variants: {
    variant: {
      outline: 'rounded-card border border-border-default transition-all hover:shadow-xs',
      plain: '',
      ruled: 'border-t border-border',
    },
  },
  defaultVariants: {
    variant: 'outline',
  },
});

export { cardVariants };
