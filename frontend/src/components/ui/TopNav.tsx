import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export interface TopNavProps extends React.HTMLAttributes<HTMLElement> {
  alignment?: "Left" | "Center" | "Right";
  avatar?: boolean;
  blurBackground?: boolean;
  glass?: boolean;
  logo?: React.ReactNode;
  navItems?: { label: string; href?: string; active?: boolean }[];
  actionSlot?: React.ReactNode;
  avatarSlot?: React.ReactNode;
}

export function TopNav({
  alignment = "Left",
  avatar = true,
  blurBackground = true,
  glass = false,
  logo,
  navItems = [
    { label: "Home", active: true },
    { label: "About Us" },
    { label: "Services" },
    { label: "Contact" },
    { label: "Blog" },
  ],
  actionSlot,
  avatarSlot,
  className,
  ...props
}: TopNavProps) {
  return (
    <nav
      className={cn(
        "flex items-center gap-5 px-10 py-4 relative w-full border-b border-stroke-soft-200 z-30",
        className
      )}
      {...props}
    >
      {/* Background Layers */}
      {blurBackground && (
        <div className="absolute inset-0 overflow-hidden -z-10">
          <div className="absolute inset-0 bg-white/95 backdrop-blur-[128px]" />
        </div>
      )}
      {glass && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 to-transparent backdrop-blur-md -z-10" />
      )}

      {/* Logo */}
      <div className="flex flex-col items-start shrink-0 w-[132px]">
        {logo || (
          <div className="flex items-center gap-1 font-bold text-xl tracking-tighter text-text-strong-950">
            <span className="text-primary-base">V</span> VOIT
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <div 
        className={cn(
          "flex-1 flex items-center min-w-0 overflow-x-auto scrollbar-none",
          alignment === "Left" && "justify-start",
          alignment === "Center" && "justify-center",
          alignment === "Right" && "justify-end"
        )}
      >
        <div className="flex gap-1 items-start bg-transparent">
          {navItems.map((item, i) => (
            <a
              key={i}
              href={item.href || "#"}
              className={cn(
                "flex items-center justify-center h-[34px] px-3 py-2 rounded-[12px] text-sm font-medium transition-colors whitespace-nowrap",
                item.active 
                  ? "bg-bg-weak-50 text-text-strong-950 shadow-sm" 
                  : "text-text-sub-600 hover:bg-bg-weak-50 hover:text-text-strong-950"
              )}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Trailing Actions */}
      <div className="flex items-center gap-4 justify-end shrink-0">
        {actionSlot || (
          <Button variant="primary">
            Get started
          </Button>
        )}
        
        {avatar && (
          <div className="flex items-center justify-center shrink-0">
            {avatarSlot || (
              <div className="size-[40px] rounded-[28px] overflow-hidden bg-bg-weak-50 border border-stroke-soft-200 flex items-center justify-center cursor-pointer">
                {/* Fallback avatar visual */}
                <span className="font-semibold text-text-sub-600 text-sm">ID</span>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
