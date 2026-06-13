import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'neutral' | 'active' | 'absent';
  className?: string;
  showDot?: boolean;
}

const variantClasses = {
  success: 'bg-[#ecfdf3] text-[#027a48] border-[#abefc6]',
  active: 'bg-[#f8f9fb] text-[#1a1c21] border-[#e2e4e9]',
  warning: 'bg-[#fff5cc] text-[#997a00] border-[#ffeb99]',
  error: 'bg-[#fef3f2] text-[#b42318] border-[#fecdca]',
  neutral: 'bg-[#f8f9fb] text-[#1a1c21] border-[#e2e4e9]',
  absent: 'bg-[#f8f9fb] text-[#1a1c21] border-[#e2e4e9]',
};

const dotColors = {
  success: 'bg-[#17b26a]',
  active: 'bg-[#17b26a]',
  warning: 'bg-[#f79009]',
  error: 'bg-[#f04438]',
  neutral: 'bg-[#667085]',
  absent: 'bg-[#667085]',
};

export function Badge({ children, variant = 'neutral', className = '', showDot = false }: BadgeProps) {
  // If explicitly active/absent or success/neutral with dot requested, show it
  const shouldShowDot = showDot || variant === 'active' || variant === 'absent';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${variantClasses[variant]} ${className}`}
    >
      {shouldShowDot && (
        <svg className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} viewBox="0 0 6 6" aria-hidden="true">
          <circle cx="3" cy="3" r="3" fill="currentColor" />
        </svg>
      )}
      <span>{children}</span>
    </div>
  );
}
