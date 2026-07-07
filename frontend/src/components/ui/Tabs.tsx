"use client";

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex max-w-full items-center justify-start gap-1 overflow-x-auto rounded-ui border border-stroke-soft-200 bg-bg-white-0 p-1 shadow-none',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-[10px] px-4 py-2 font-sans text-[14px] font-bold text-text-sub-600 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20 disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:bg-bg-accent-soft data-[state=active]:text-primary-accent data-[state=active]:shadow-none',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-6 ring-offset-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20', className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
