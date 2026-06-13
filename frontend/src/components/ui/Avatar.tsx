import React from 'react';
import Image from 'next/image';

export interface AvatarProps {
  src?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-base', // 40px
  lg: 'w-20 h-20 text-2xl', // 80px
};

export function Avatar({ src, fallback, size = 'md', className = '' }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);

  const containerClasses = `relative shrink-0 overflow-hidden rounded-full ${sizeClasses[size]} ${
    !src || imgError ? 'bg-neutral-gray-200 flex items-center justify-center' : ''
  } ${className}`;

  return (
    <div className={containerClasses}>
      {src && !imgError ? (
        <Image
          src={src}
          alt={fallback}
          fill
          className="object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="font-inter font-medium text-text-strong-950 uppercase tracking-tight">
          {fallback.substring(0, 2)}
        </span>
      )}
    </div>
  );
}
