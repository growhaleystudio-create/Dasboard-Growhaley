import * as React from "react";
import { cn } from "@/lib/utils";

export interface BentoGridProps extends React.HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4;
}

export function BentoGrid({ className, cols, children, ...props }: BentoGridProps) {
  const colClasses = {
    1: "md:grid-cols-1",
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4 lg:grid-cols-4",
  };

  return (
    <div
      className={cn(
        "grid w-full gap-4 grid-cols-1",
        cols ? colClasses[cols] : "md:grid-cols-3 lg:grid-cols-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  span?: 1 | 2 | 3 | 4;
  rowSpan?: 1 | 2 | 3 | 4;
}

export function BentoCard({ className, span = 1, rowSpan = 1, children, ...props }: BentoCardProps) {
  const spanClasses = {
    1: "col-span-1",
    2: "col-span-1 md:col-span-2",
    3: "col-span-1 md:col-span-3",
    4: "col-span-1 md:col-span-4",
  };

  const rowClasses = {
    1: "row-span-1",
    2: "row-span-2",
    3: "row-span-3",
    4: "row-span-4",
  };

  return (
    <div
      className={cn(
        "rounded-panel bg-bg-white-0 border border-stroke-soft-200 overflow-hidden flex flex-col transition-all",
        spanClasses[span],
        rowClasses[rowSpan],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
