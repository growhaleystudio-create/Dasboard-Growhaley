import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  /** Maximum number of items to show before truncating */
  maxItems?: number;
}

export function Breadcrumb({ items, className, maxItems = 4 }: BreadcrumbProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!items || items.length === 0) return null;

  // Truncation logic
  let renderedItems = items;
  if (items.length > maxItems && !isExpanded) {
    const firstItem = items[0] as BreadcrumbItem;
    const lastItems = items.slice(-(maxItems - 2)); 
    renderedItems = [firstItem, { label: '...', href: '#' }, ...lastItems];
  }

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-[14px] text-text-sub-600', className)}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {renderedItems.map((item, index) => {
          const isLast = index === renderedItems.length - 1;
          const isEllipsis = item.label === '...';

          return (
            <li key={index} className="flex items-center gap-1.5 sm:gap-2">
              {isEllipsis ? (
                <button
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  className="flex size-6 items-center justify-center rounded-md text-text-soft-400 hover:bg-bg-weak-50 hover:text-text-strong-950 transition-colors"
                  aria-label="Show all breadcrumbs"
                >
                  <MoreHorizontal size={16} />
                </button>
              ) : item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-text-strong-950"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    isLast ? 'font-medium text-text-strong-950' : 'transition-colors hover:text-text-strong-950'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}

              {!isLast && (
                <span className="flex items-center text-stroke-strong-300">
                  <ChevronRight size={16} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
