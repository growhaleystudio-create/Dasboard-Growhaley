import * as React from "react";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface BasicCardProps extends React.HTMLAttributes<HTMLDivElement> {
  layout?: "Vertical" | "Horizontal";
  header?: boolean;
  thumbnailContent?: boolean;
  thumbnailSrc?: string;
  body?: boolean;
  title?: string;
  subtitle?: string;
  paragraph?: string;
  footer?: React.ReactNode;
  headerAction?: React.ReactNode;
}

export function BasicCard({
  layout = "Vertical",
  header = false,
  thumbnailContent = true,
  thumbnailSrc,
  body = true,
  title,
  subtitle,
  paragraph,
  footer,
  headerAction,
  className,
  ...props
}: BasicCardProps) {
  const isHorizontal = layout === "Horizontal";

  return (
    <div
      className={cn(
        "bg-bg-white-0 flex p-4 relative rounded-[32px] overflow-hidden border border-stroke-soft-200 shadow-none transition-all",
        isHorizontal ? "flex-row gap-4 h-auto w-full" : "flex-col gap-0 h-[616px] w-[458px] max-w-full",
        className
      )}
      {...props}
    >
      <div className={cn("flex flex-1 gap-5 relative", isHorizontal ? "flex-row w-full" : "flex-col w-full")}>
        
        {/* Horizontal: Thumbnail on Left */}
        {isHorizontal && thumbnailContent && (
          <div className="w-[300px] shrink-0 h-full overflow-hidden rounded-[20px] bg-bg-weak-50">
            {thumbnailSrc ? (
              <img src={thumbnailSrc} alt={title || "Thumbnail"} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-primary-base/10" /> // Placeholder
            )}
          </div>
        )}

        <div className="flex flex-col flex-1 gap-5 min-w-0">
          {/* Header */}
          {header && (
            <div className="flex gap-2 items-center w-full">
              <div className="flex flex-1 flex-col justify-center min-w-0">
                <p className="font-semibold text-xl tracking-tight text-text-strong-950 truncate">
                  Heading title
                </p>
              </div>
              <div className="shrink-0">
                {headerAction || (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="size-5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Vertical: Thumbnail in Middle */}
          {!isHorizontal && thumbnailContent && (
            <div className="flex-1 w-full min-h-0 overflow-hidden rounded-[20px] bg-bg-weak-50">
              {thumbnailSrc ? (
                <img src={thumbnailSrc} alt={title || "Thumbnail"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary-base/10" />
              )}
            </div>
          )}

          {/* Body Content */}
          {body && (
            <div className="flex flex-col gap-3 w-full shrink-0">
              {title && (
                <p className="font-bold text-[22px] leading-7 tracking-tight text-text-strong-950 line-clamp-2">
                  {title}
                </p>
              )}
              {subtitle && (
                <p className="font-normal text-base text-text-strong-950 tracking-tight truncate">
                  {subtitle}
                </p>
              )}
              {paragraph && (
                <p className="font-normal text-sm text-text-sub-600 tracking-tight line-clamp-3">
                  {paragraph}
                </p>
              )}
            </div>
          )}
          
          {/* Footer */}
          {footer && (
            <div className="flex items-center gap-3 w-full mt-auto pt-4 border-t border-stroke-soft-200">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
