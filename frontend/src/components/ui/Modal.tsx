import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'drawer';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
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
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-text-strong-950/20 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Card / Drawer Sheet */}
      <div
        className={cn(
          "relative flex flex-col overflow-hidden bg-bg-white-0 shadow-panel transition-all",
          isDrawer
            ? "h-full max-h-screen w-full max-w-lg sm:max-w-xl rounded-none sm:rounded-l-panel animate-in fade-in slide-in-from-right duration-300"
            : cn(
                "max-h-[92dvh] w-full rounded-panel animate-in fade-in zoom-in-95 duration-200",
                size === 'sm' && "max-w-sm",
                size === 'md' && "max-w-lg",
                size === 'lg' && "max-w-2xl",
                size === 'xl' && "max-w-4xl",
                size === 'full' && "max-w-full m-3 sm:m-4"
              )
        )}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stroke-soft-200 px-4 py-4 sm:px-6">
          <h2 className="font-sans text-[18px] font-bold leading-[1.3] tracking-[-0.01em] text-text-strong-950">
            {title}
          </h2>
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
