import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface AvatarProps {
  src?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-20 text-2xl',
};

export function Avatar({ src, fallback, size = 'md', className = '' }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full border border-stroke-soft-200 bg-bg-accent-soft',
        sizeClasses[size],
        className
      )}
    >
      {src && !imgError ? (
        <Image src={src} alt={fallback} fill className="object-cover" onError={() => setImgError(true)} />
      ) : (
        <span className="flex size-full items-center justify-center font-sans font-bold uppercase tracking-[0.04em] text-primary-accent">
          {fallback.substring(0, 2)}
        </span>
      )}
    </div>
  );
}
