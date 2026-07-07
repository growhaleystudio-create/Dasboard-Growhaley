import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface ChartCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string | undefined;
  action?: React.ReactNode | undefined;
  icon?: React.ReactNode | undefined;
  value?: string | undefined;
  trend?: {
    value: string;
    isPositive: boolean;
  } | undefined;
  variant?: 'md' | 'xl' | undefined;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  action,
  icon,
  value,
  trend,
  variant = 'md',
  className,
  children,
  ...props
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col bg-transparent",
        className
      )}
      {...props}
    >
      {/* Header Layout MD/XL Charts */}
      <div className={cn("flex flex-col gap-4", variant === 'xl' ? "px-8 pt-8 pb-4" : "px-6 pt-6 pb-2")}>
        {/* Top Row: Icon + Title & Action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && <div className={cn("text-text-soft-400 flex items-center justify-center", variant === 'xl' ? "size-5" : "size-4")}>{icon}</div>}
            <h3 className={cn("font-medium text-text-strong-950 tracking-tight", variant === 'xl' ? "text-[18px]" : "text-[15px]")}>
              {title}
            </h3>
          </div>
          {action ? <div className="flex items-center shrink-0">{action}</div> : null}
        </div>

        {/* Second Row: Subtitle */}
        {subtitle && (
          <p className={cn("font-medium text-text-sub-600 -mt-2", variant === 'xl' ? "text-[14px]" : "text-[13px]")}>
            {subtitle}
          </p>
        )}

        {/* Third Row: KPI Value & Trend */}
        {value && (
          <div className="flex items-center gap-3 mt-1">
            <span className={cn("leading-none font-bold text-text-strong-950 tracking-tight", variant === 'xl' ? "text-[40px]" : "text-[32px]")}>
              {value}
            </span>
            {trend && (
              <div className={cn("flex items-center gap-1 bg-bg-weak-50 rounded-md", variant === 'xl' ? "px-3 py-1.5" : "px-2 py-1")}>
                {trend.isPositive ? (
                  <ArrowUpRight className={cn("text-state-info-base", variant === 'xl' ? "size-4" : "size-3")} />
                ) : (
                  <ArrowDownRight className={cn("text-state-danger-base", variant === 'xl' ? "size-4" : "size-3")} />
                )}
                <span className={cn(
                  "font-semibold",
                  trend.isPositive ? "text-state-info-base" : "text-state-danger-base",
                  variant === 'xl' ? "text-sm" : "text-xs"
                )}>
                  {trend.value}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chart Body */}
      <div className="flex flex-col px-6 pb-6 pt-2 w-full flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
