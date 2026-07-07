import React from 'react';
import { cn } from '@/lib/utils';

type TableProps = React.HTMLAttributes<HTMLDivElement>;
type TableSectionProps = React.HTMLAttributes<HTMLTableSectionElement>;
type TableRowProps = React.HTMLAttributes<HTMLTableRowElement>;
type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement>;
type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export const Table = ({ children, className = '', ...props }: TableProps) => (
  <div className={cn('w-full overflow-x-auto rounded-panel border border-stroke-soft-200 bg-bg-white-0', className)} {...props}>
    <table className="w-full border-collapse text-left">
      {children}
    </table>
  </div>
);

export const TableHeader = ({ children, className = '', ...props }: TableSectionProps) => (
  <thead className={cn('border-b border-stroke-soft-200 bg-bg-subtle', className)} {...props}>
    {children}
  </thead>
);

export const TableRow = ({ children, className = '', ...props }: TableRowProps) => (
  <tr className={cn('border-b border-stroke-soft-200 transition-colors hover:bg-bg-weak-50/70', className)} {...props}>
    {children}
  </tr>
);

export const TableHead = ({ children, className = '', ...props }: TableHeadProps) => (
  <th
    className={cn(
      'font-sans whitespace-nowrap px-5 py-4 text-[11px] font-bold uppercase tracking-[0.08em] text-text-soft-400',
      className
    )}
    {...props}
  >
    {children}
  </th>
);

export const TableCell = ({ children, className = '', ...props }: TableCellProps) => (
  <td className={cn('font-sans whitespace-nowrap px-5 py-4 text-[14px] leading-5 text-text-strong-950', className)} {...props}>
    {children}
  </td>
);
