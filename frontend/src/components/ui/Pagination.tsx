import * as React from "react"
import { cn } from "@/lib/utils"

export interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  currentPage?: number
  totalPages?: number
  totalItems?: number
  onPageChange?: (page: number) => void
  size?: "Small" | "Medium"
}

export function Pagination({
  currentPage = 1,
  totalPages = 10,
  onPageChange,
  size = "Small",
  className,
  ...props
}: PaginationProps) {
  const isSmall = size === "Small"
  
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1)
  
  const itemClass = cn(
    "content-stretch flex gap-1 items-center justify-center p-2 relative shrink-0",
    isSmall 
      ? "h-[34px] min-h-[34px] min-w-[34px] rounded-[var(--corner-medium)]" 
      : "h-[40px] min-h-[40px] min-w-[40px] rounded-[var(--corner-full)]"
  )

  const activeClass = "bg-[var(--button-secondary-light-active)]"
  const inactiveClass = "bg-[var(--button-secondary-light-default)] hover:bg-[var(--button-secondary-light-hover)] cursor-pointer"
  
  const textClass = cn(
    "font-medium relative shrink-0 whitespace-nowrap text-[color:var(--label-primary)]",
    isSmall ? "text-sm leading-[18px] tracking-[-0.1px]" : "text-base leading-[21px] tracking-[-0.3px]"
  )

  const svgSize = isSmall ? "18" : "20"

  return (
    <div
      className={cn(
        "bg-[var(--background-1)] content-stretch flex gap-1 items-center py-[2px] relative rounded-md",
        className
      )}
      {...props}
    >
      <button 
        onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className={cn(itemClass, inactiveClass, "disabled:opacity-50 disabled:cursor-not-allowed")}
      >
        <svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
      </button>

      {pages.map((page) => {
        const isActive = page === currentPage
        return (
          <button
            key={page}
            onClick={() => onPageChange?.(page)}
            className={cn(itemClass, isActive ? activeClass : inactiveClass)}
          >
            <span className={textClass}>{page}</span>
          </button>
        )
      })}

      {totalPages > 5 && (
        <button className={cn(itemClass, inactiveClass)}>
          <svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
      )}

      <button 
        onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className={cn(itemClass, inactiveClass, "disabled:opacity-50 disabled:cursor-not-allowed")}
      >
        <svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </button>
    </div>
  )
}
