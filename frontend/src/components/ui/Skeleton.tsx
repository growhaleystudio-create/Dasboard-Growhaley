import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-bg-weak-50', className)}
      {...props}
    />
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-stroke-soft-200 pb-6">
      <Skeleton className="size-12 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>
    </div>
  );
}

export function TableSkeleton({
  columns,
  rows = 5,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row}>
          {Array.from({ length: columns }).map((__, column) => (
            <td key={column} className="px-3 py-3">
              <Skeleton className={column === columns - 1 ? 'h-8 w-24 rounded-md' : 'h-5 w-full max-w-[180px]'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
