import React, { useRef, useState } from 'react';
import { UploadCloud, File as FileIcon, X, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface FileDropProps {
  layoutType?: 'default' | 'button' | 'small';
  variant?: 'accent' | 'primary';
  uploadState?: 'idle' | 'uploading' | 'error' | 'done';
  isOutlined?: boolean;
  onFileDrop?: (files: File[]) => void;
  onCancel?: () => void;
  progress?: number; // 0-100
  fileName?: string;
  errorMessage?: string;
  className?: string;
  actionLabel?: string;
  accept?: string;
  disabled?: boolean;
}

export function FileDrop({
  layoutType = 'default',
  variant = 'accent',
  uploadState = 'idle',
  isOutlined = true,
  onFileDrop,
  onCancel,
  progress = 0,
  fileName,
  errorMessage,
  className,
  actionLabel = 'Upload File',
  accept,
  disabled = false,
}: FileDropProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileDrop?.(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.target.files && e.target.files.length > 0) {
      onFileDrop?.(Array.from(e.target.files));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (uploadState === 'idle' || uploadState === 'error') {
      fileInputRef.current?.click();
    }
  };

  const variantStyles = {
    accent: {
      idle: 'border-stroke-strong-300 bg-bg-weak-50 hover:bg-bg-accent-soft hover:border-primary-accent cursor-pointer',
      active: 'border-primary-accent bg-bg-accent-soft',
      uploading: 'border-primary-accent bg-bg-accent-soft',
      done: 'border-state-success-base bg-state-success-bg',
      error: 'border-state-danger-border bg-state-danger-light cursor-pointer',
      icon: 'text-primary-accent',
    },
    primary: {
      idle: 'border-stroke-strong-300 bg-bg-weak-50 hover:bg-alpha-primary-10 hover:border-primary-base cursor-pointer',
      active: 'border-primary-base bg-alpha-primary-10',
      uploading: 'border-primary-base bg-alpha-primary-10',
      done: 'border-state-success-base bg-state-success-bg',
      error: 'border-state-danger-border bg-state-danger-light cursor-pointer',
      icon: 'text-primary-base',
    }
  };

  const stateStyle = isDragActive ? variantStyles[variant].active : variantStyles[variant][uploadState];
  const borderStyle = isOutlined ? 'border-2 border-dashed' : 'border border-solid';

  if (layoutType === 'button') {
    return (
      <div className={className}>
        <Button variant={variant === 'primary' ? 'primary' : 'secondary'} className="relative overflow-hidden" disabled={disabled}>
          <label className={cn("flex items-center justify-center gap-2 w-full h-full", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
            <UploadCloud size={16} />
            <span>{actionLabel}</span>
            <input type="file" accept={accept} className="hidden" disabled={disabled} onChange={handleFileInput} />
          </label>
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        'relative flex w-full flex-col items-center justify-center rounded-ui transition-colors',
        layoutType === 'small' ? 'p-4' : 'p-8',
        borderStyle,
        stateStyle,
        className
      )}
    >
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        onChange={handleFileInput} 
        disabled={uploadState === 'uploading'} 
      />
      
      {uploadState === 'idle' && (
        <div className="flex flex-col items-center text-center pointer-events-none">
          <div className={cn('mb-3 flex items-center justify-center rounded-full bg-bg-white-0 p-3 shadow-sm', variantStyles[variant].icon)}>
            <UploadCloud size={layoutType === 'small' ? 20 : 24} />
          </div>
          <p className="text-[14px] font-medium text-text-strong-950">
            <span className="text-primary-accent">Click to upload</span> or drag and drop
          </p>
          {layoutType === 'default' && (
            <p className="mt-1 text-[12px] text-text-sub-600">SVG, PNG, JPG or GIF (max. 800x400px)</p>
          )}
        </div>
      )}

      {uploadState === 'uploading' && (
        <div className="flex w-full items-center gap-4 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-white-0 shadow-sm">
            <FileIcon size={20} className={variantStyles[variant].icon} />
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[14px] font-medium text-text-strong-950 mb-1">
              <span className="truncate">{fileName || 'Uploading file...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-stroke-strong-300/30">
              <div 
                className={cn('h-full rounded-full transition-all duration-300', variant === 'primary' ? 'bg-primary-base' : 'bg-primary-accent')}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button type="button" onClick={onCancel} className="relative z-10 shrink-0 rounded-full p-1 text-text-sub-600 hover:bg-black/5 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {uploadState === 'done' && (
        <div className="flex w-full items-center gap-4 px-2">
           <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-white-0 shadow-sm">
            <CheckCircle size={20} className="text-state-success-base" />
          </div>
          <div className="flex-1">
             <p className="text-[14px] font-medium text-text-strong-950 truncate">{fileName || 'File uploaded successfully'}</p>
             <p className="text-[12px] text-state-success-dark">Complete</p>
          </div>
           <button type="button" onClick={onCancel} className="relative z-10 shrink-0 rounded-full p-1 text-text-sub-600 hover:bg-black/5 transition-colors">
            <X size={16} />
          </button>
        </div>
      )}

      {uploadState === 'error' && (
        <div className="flex w-full items-center gap-4 px-2">
           <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-white-0 shadow-sm">
            <AlertCircle size={20} className="text-state-danger-base" />
          </div>
          <div className="flex-1">
             <p className="text-[14px] font-medium text-state-danger-dark truncate">{fileName || 'Upload failed'}</p>
             <p className="text-[12px] text-state-danger-base">{errorMessage || 'Something went wrong, please try again.'}</p>
          </div>
           <button type="button" onClick={onCancel} className="relative z-10 shrink-0 text-state-danger-dark hover:text-state-danger-hover font-medium text-[14px] transition-colors">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
