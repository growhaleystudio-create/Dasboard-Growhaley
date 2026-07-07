import * as React from "react"
import { cn } from "@/lib/utils"

export interface PageControlProps extends React.HTMLAttributes<HTMLDivElement> {
  totalDots?: number
  activeIndex?: number
  showMore?: boolean
}

export function PageControl({
  totalDots = 5,
  activeIndex = 0,
  showMore = false,
  className,
  ...props
}: PageControlProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-3 py-2 relative rounded-full backdrop-blur-[20px] bg-[var(--layer-primary-1-default)] content-stretch",
        className
      )}
      {...props}
    >
      {Array.from({ length: totalDots }).map((_, index) => {
        const isActive = index === activeIndex
        return (
          <div
            key={index}
            className={cn(
              "relative rounded-full shrink-0",
              isActive 
                ? "bg-[var(--layer-primary-primary-default)] size-2" 
                : "bg-[var(--layer-primary-4-default)] opacity-30 size-2"
            )}
          />
        )
      })}
      {showMore && (
        <div className="bg-[var(--layer-primary-4-default)] opacity-30 relative rounded-full shrink-0 size-[6px]" />
      )}
    </div>
  )
}
