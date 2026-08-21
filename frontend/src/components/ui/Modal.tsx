import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'drawer';
}

export function Modal({ isOpen, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDrawer = size === 'drawer';

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex p-3 transition-all",
        isDrawer 
          ? "justify-end items-stretch p-0" 
          : "items-end justify-center sm:items-center sm:p-4"
      )}
    >
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />
      <div
        className={cn(
          "relative flex flex-col bg-bg-white-0 text-text-strong-950 shadow-2xl transition-all",
          isDrawer
            ? "h-full w-full max-w-xl rounded-l-[28px] border-l border-stroke-soft-200"
            : "w-full rounded-[24px] border border-stroke-soft-200 max-h-[90vh]",
          !isDrawer && size === 'sm' && "max-w-md",
          !isDrawer && size === 'md' && "max-w-lg",
          !isDrawer && size === 'lg' && "max-w-2xl",
          !isDrawer && size === 'xl' && "max-w-4xl",
          !isDrawer && size === 'full' && "max-w-[95vw] h-[95vh]"
        )}
      >
        <div className="flex items-center justify-between border-b border-stroke-soft-200 px-6 py-4">
          <div>
            <h3 className="font-heading text-lg font-semibold leading-6 text-text-strong-950">
              {title}
            </h3>
            {description ? (
              <p className="mt-0.5 text-xs text-text-sub-600">
                {description}
              </p>
            ) : null}
          </div>
          <button 
            onClick={onClose}
            className="text-text-soft-400 hover:text-text-strong-950 transition-colors p-1"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-4 font-sans text-[14px] leading-[1.45] text-text-sub-600 sm:px-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stroke-soft-200 bg-bg-weak-50 px-4 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
