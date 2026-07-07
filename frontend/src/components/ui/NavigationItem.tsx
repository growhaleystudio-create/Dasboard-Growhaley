import React from 'react';
import Link from 'next/link';

export interface NavigationItemProps {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  active?: boolean;
  rightElement?: React.ReactNode;
}

export function NavigationItem({ href, icon, children, active = false, rightElement }: NavigationItemProps) {
  return (
    <Link
      href={href}
      className={`content-stretch flex gap-[8px] items-center overflow-clip pl-[6px] pr-[8px] py-[6px] relative rounded-[8px] shrink-0 w-full transition-colors ${
        active
          ? 'bg-bg-weak-50 text-text-strong-950'
          : 'bg-bg-white-0 text-text-sub-600 hover:bg-bg-weak-50'
      }`}
    >
      {icon && <div className="shrink-0 flex items-center justify-center size-[20px]">{icon}</div>}
      <div className="flex min-w-px flex-[1_0_0] flex-col justify-center truncate font-sans text-[14px] font-bold leading-[1.45] tracking-[-0.01em]">
        <p className="leading-[20px] truncate">{children}</p>
      </div>
      {rightElement && <div className="shrink-0 flex items-center justify-center">{rightElement}</div>}
    </Link>
  );
}
