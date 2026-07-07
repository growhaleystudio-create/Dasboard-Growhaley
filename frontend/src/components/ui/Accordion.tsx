import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';

export interface AccordionItemData {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItemData[];
  size?: 'sm' | 'md' | 'lg';
  accordionStyle?: 'subtle' | 'line' | 'fill' | 'onColor';
  chevronPosition?: 'left' | 'right';
  className?: string;
  allowMultiple?: boolean;
}

const sizeClasses = {
  sm: {
    header: 'py-2 px-3 text-[13px]',
    icon: 16,
    content: 'px-3 pb-3 pt-0 text-[13px]',
  },
  md: {
    header: 'py-3 px-4 text-[14px]',
    icon: 18,
    content: 'px-4 pb-4 pt-0 text-[14px]',
  },
  lg: {
    header: 'py-4 px-5 text-[16px]',
    icon: 20,
    content: 'px-5 pb-5 pt-0 text-[16px]',
  },
};

const styleClasses = {
  subtle: 'bg-transparent text-text-strong-950 hover:bg-alpha-primary-10/50 rounded-ui',
  line: 'bg-transparent border border-stroke-soft-200 text-text-strong-950 hover:bg-bg-weak-50 rounded-ui',
  fill: 'bg-bg-weak-50 text-text-strong-950 hover:bg-stroke-soft-200/50 rounded-ui',
  onColor: 'bg-transparent text-bg-white-0 hover:bg-white/10 rounded-ui',
};

export function Accordion({
  items,
  size = 'md',
  accordionStyle = 'subtle',
  chevronPosition = 'right',
  className,
  allowMultiple = false,
}: AccordionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        if (!allowMultiple) {
          newSet.clear();
        }
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div className={cn('flex w-full flex-col gap-2', className)}>
      {items.map((item) => {
        const isExpanded = expandedIds.has(item.id);
        const { header, icon, content } = sizeClasses[size];
        
        return (
          <div key={item.id} className={cn('overflow-hidden transition-colors', styleClasses[accordionStyle])}>
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              className={cn(
                'flex w-full items-center justify-between font-medium outline-none',
                header,
                chevronPosition === 'left' && 'flex-row-reverse justify-end gap-3'
              )}
              aria-expanded={isExpanded}
            >
              <span className="flex-1 text-left">{item.title}</span>
              <span
                className={cn(
                  'shrink-0 text-current opacity-70 transition-transform duration-200',
                  isExpanded ? 'rotate-180' : 'rotate-0',
                  chevronPosition === 'left' && !isExpanded && '-rotate-90' 
                )}
              >
                <ChevronDown size={icon} />
              </span>
            </button>
            <div
              className={cn(
                'grid transition-all duration-200 ease-in-out',
                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div className="overflow-hidden">
                <div className={cn('text-text-sub-600', accordionStyle === 'onColor' && 'text-bg-white-0/80', content)}>
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
