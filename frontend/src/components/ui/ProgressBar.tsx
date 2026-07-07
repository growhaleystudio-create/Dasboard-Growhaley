import * as React from "react"
import { cn } from "@/lib/utils"

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  percentage?: number
  label?: string
  showPercentage?: boolean
  size?: "Medium" | "Large"
}

export function ProgressBar({
  percentage = 40,
  label = "Text",
  showPercentage = true,
  size = "Large",
  className,
  ...props
}: ProgressBarProps) {
  const isLarge = size === "Large"
  const safePercentage = Math.min(Math.max(percentage, 0), 100)

  return (
    <div
      className={cn(
        "content-stretch flex flex-col gap-[2px] items-start justify-center relative w-[292px] max-w-full",
        className
      )}
      {...props}
    >
      <div 
        className={cn(
          "overflow-clip relative shrink-0 w-full",
          isLarge ? "h-3 rounded-[var(--corner-xsmall)]" : "h-2 rounded-[var(--corner-full)]"
        )}
      >
        <div className="absolute bg-[var(--border-disabled)] inset-0" />
        <div 
          className="absolute bg-[var(--border-accent)] inset-y-0 left-0" 
          style={{ width: `${safePercentage}%` }}
        />
      </div>

      {(label || showPercentage) && (
        <div className="content-stretch flex gap-1 items-start relative shrink-0 w-full mt-1">
          {label && (
            <div className="[word-break:break-word] flex flex-col font-normal justify-center leading-[0] relative shrink-0 text-[color:var(--label-primary)] text-sm tracking-[-0.1px] whitespace-nowrap">
              <p className="leading-[18px]">{label}</p>
            </div>
          )}
          <div className="bg-transparent flex-[1_0_0] min-w-px relative self-stretch" />
          {showPercentage && (
            <div className="[word-break:break-word] flex flex-col font-normal justify-center leading-[0] relative shrink-0 text-[color:var(--label-secondary)] text-sm text-right tracking-[-0.1px] whitespace-nowrap">
              <p className="leading-[18px]">{Math.round(safePercentage)}%</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
