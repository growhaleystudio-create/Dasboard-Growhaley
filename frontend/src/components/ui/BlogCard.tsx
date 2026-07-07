import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface BlogCardProps extends React.HTMLAttributes<HTMLDivElement> {
  thumbnailSrc?: string;
  category?: string;
  title: string;
  excerpt?: string;
  authorName?: string;
  authorRole?: string;
  authorAvatarSrc?: string;
  tags?: string[];
  onReadMore?: () => void;
  onHeaderAction?: () => void;
}

export function BlogCard({
  thumbnailSrc,
  category,
  title,
  excerpt,
  authorName,
  authorRole,
  authorAvatarSrc,
  tags = [],
  onReadMore,
  onHeaderAction,
  className,
  ...props
}: BlogCardProps) {
  return (
    <div
      className={cn(
        "bg-bg-white-0 flex flex-col items-start overflow-hidden p-1 relative rounded-[32px] w-[300px] h-[456px] border border-stroke-soft-200 transition-all group",
        className
      )}
      {...props}
    >
      {/* Thumbnail */}
      <div className="flex flex-1 flex-col items-center justify-center min-h-0 overflow-hidden relative rounded-[30px] w-full bg-bg-weak-50">
        {thumbnailSrc ? (
          <img src={thumbnailSrc} alt={title} className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0 bg-primary-base/10" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-3 items-start justify-end p-3 relative rounded-[16px] shrink-0 w-full z-10">
        <div className="flex gap-1 items-start relative w-full">
          <div className="flex flex-1 flex-col gap-1 items-start min-w-0">
            {category && (
              <p className="font-normal text-xs text-primary-base tracking-tight w-full truncate">
                {category}
              </p>
            )}
            <p className="font-bold text-lg leading-[23px] text-text-strong-950 tracking-tight w-full line-clamp-2">
              {title}
            </p>
          </div>
          
          {onHeaderAction && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full shrink-0"
              onClick={onHeaderAction}
              aria-label="Action"
            >
              <ArrowUpRight className="size-5" />
            </Button>
          )}
        </div>

        {/* Divider */}
        {(excerpt || tags.length > 0 || authorName) && (
          <div className="w-full h-px bg-stroke-soft-200" />
        )}

        {/* Excerpt */}
        {excerpt && (
          <p className="font-normal text-sm text-text-sub-600 tracking-tight w-full line-clamp-2">
            {excerpt}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center w-full">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="bg-bg-weak-50 text-text-strong-950 px-2.5 py-0.5 rounded-full text-xs font-medium tracking-tight"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Author & CTA */}
        {(authorName || onReadMore) && (
          <div className="flex gap-2 items-center w-full mt-1">
            {authorName && (
              <div className="flex gap-2 items-center flex-1 min-w-0">
                <div className="size-10 rounded-full bg-bg-weak-50 overflow-hidden shrink-0">
                  {authorAvatarSrc ? (
                    <img src={authorAvatarSrc} alt={authorName} className="size-full object-cover" />
                  ) : (
                    <div className="size-full bg-primary-base/20" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <p className="font-semibold text-sm text-text-strong-950 truncate w-full">
                    {authorName}
                  </p>
                  {authorRole && (
                    <p className="font-normal text-xs text-text-sub-600 truncate w-full">
                      {authorRole}
                    </p>
                  )}
                </div>
              </div>
            )}

            {onReadMore && (
              <Button
                variant="secondary"
                size="lg"
                className="rounded-full shrink-0 w-full sm:w-auto"
                onClick={onReadMore}
              >
                Read More
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
