import React from 'react';
import { cn } from '@/lib/utils';

const textVariants = {
  'display-1': 'text-[96px] leading-[1.1] tracking-[-0.04em] font-normal',
  'display-1-bold': 'text-[96px] leading-[1.1] tracking-[-0.04em] font-bold',
  'display-2': 'text-[80px] leading-[1.12] tracking-[-0.035em] font-normal',
  'display-2-bold': 'text-[80px] leading-[1.12] tracking-[-0.035em] font-bold',
  'display-3': 'text-[56px] leading-[1.18] tracking-[-0.03em] font-normal',
  'display-3-bold': 'text-[56px] leading-[1.18] tracking-[-0.03em] font-bold',
  h1: 'text-[48px] leading-[1.2] tracking-[-0.03em] font-normal',
  'h1-bold': 'text-[48px] leading-[1.2] tracking-[-0.03em] font-bold',
  h2: 'text-[36px] leading-[1.2] tracking-[-0.025em] font-normal',
  'h2-bold': 'text-[36px] leading-[1.2] tracking-[-0.025em] font-bold',
  h3: 'text-[32px] leading-[1.25] tracking-[-0.02em] font-normal',
  'h3-bold': 'text-[32px] leading-[1.25] tracking-[-0.02em] font-bold',
  'title-1': 'text-[28px] leading-[1.25] tracking-[-0.02em] font-normal',
  'title-1-bold': 'text-[28px] leading-[1.25] tracking-[-0.02em] font-bold',
  'title-2': 'text-[22px] leading-[1.3] tracking-[-0.01em] font-normal',
  'title-2-bold': 'text-[22px] leading-[1.3] tracking-[-0.01em] font-bold',
  'title-3': 'text-[20px] leading-[1.3] tracking-[-0.01em] font-normal',
  'title-3-bold': 'text-[20px] leading-[1.3] tracking-[-0.01em] font-bold',
  'body-l': 'text-[18px] leading-[1.45] font-normal',
  'body-l-bold': 'text-[18px] leading-[1.45] font-bold',
  'body-m': 'text-[16px] leading-[1.45] font-normal',
  'body-m-bold': 'text-[16px] leading-[1.45] font-bold',
  'body-s': 'text-[14px] leading-[1.45] font-normal',
  'body-s-bold': 'text-[14px] leading-[1.45] font-bold',
  caption: 'text-[12px] leading-[1.35] font-normal',
  'caption-bold': 'text-[12px] leading-[1.35] font-bold',
  subheadline: 'text-[11px] leading-[1.35] font-normal uppercase tracking-[0.08em]',
  'subheadline-bold': 'text-[11px] leading-[1.35] font-bold uppercase tracking-[0.08em]',
  note: 'text-[10px] leading-[1.3] font-normal uppercase tracking-[0.08em]',
  'note-bold': 'text-[10px] leading-[1.3] font-bold uppercase tracking-[0.08em]',
} as const;

const colorVariants = {
  primary: 'text-text-strong-950',
  secondary: 'text-text-sub-600',
  tertiary: 'text-text-soft-400',
  accent: 'text-primary-accent',
  success: 'text-state-success-base',
  warning: 'text-state-warning-base',
  danger: 'text-state-danger-base',
} as const;

type TextVariant = keyof typeof textVariants;
type TextColor = keyof typeof colorVariants;

type TypographyProps<T extends React.ElementType> = {
  as?: T;
  variant?: TextVariant;
  color?: TextColor;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

export function Typography<T extends React.ElementType = 'p'>({
  as,
  variant = 'body-m',
  color = 'primary',
  className,
  children,
  ...props
}: TypographyProps<T>) {
  const Component = as ?? 'p';

  return (
    <Component className={cn('font-sans', textVariants[variant], colorVariants[color], className)} {...props}>
      {children}
    </Component>
  );
}

export function Heading<T extends React.ElementType = 'h2'>(props: TypographyProps<T>) {
  return <Typography {...props} />;
}

export function Text<T extends React.ElementType = 'p'>(props: TypographyProps<T>) {
  return <Typography {...props} />;
}
