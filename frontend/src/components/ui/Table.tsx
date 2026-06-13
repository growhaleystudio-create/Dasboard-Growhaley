import React from 'react';

type TableProps = React.HTMLAttributes<HTMLDivElement>;
type TableSectionProps = React.HTMLAttributes<HTMLTableSectionElement>;
type TableRowProps = React.HTMLAttributes<HTMLTableRowElement>;
type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement>;
type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export const Table = ({ children, className = '', ...props }: TableProps) => (
  <div className={`w-full overflow-x-auto border border-stroke-soft-200 rounded-lg ${className}`} {...props}>
    <table className="w-full text-left border-collapse">
      {children}
    </table>
  </div>
);

export const TableHeader = ({ children, className = '', ...props }: TableSectionProps) => (
  <thead className={`bg-bg-weak-50 border-b border-stroke-soft-200 ${className}`} {...props}>
    {children}
  </thead>
);

export const TableRow = ({ children, className = '', ...props }: TableRowProps) => (
  <tr className={`border-b border-stroke-soft-200 hover:bg-bg-weak-50 transition-colors ${className}`} {...props}>
    {children}
  </tr>
);

export const TableHead = ({ children, className = '', ...props }: TableHeadProps) => (
  <th className={`px-4 py-3 font-inter font-medium text-[13px] text-text-soft-400 whitespace-nowrap ${className}`} {...props}>
    {children}
  </th>
);

export const TableCell = ({ children, className = '', ...props }: TableCellProps) => (
  <td className={`px-4 py-3 font-inter text-[14px] text-text-strong-950 whitespace-nowrap ${className}`} {...props}>
    {children}
  </td>
);
