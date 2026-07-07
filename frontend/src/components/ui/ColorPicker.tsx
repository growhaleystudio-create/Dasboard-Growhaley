import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, SlidersHorizontal, Pipette, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface ColorPickerProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  onChangeColor?: (color: string) => void;
}

export function ColorPicker({
  color = "#004CFF",
  onChangeColor,
  className,
  ...props
}: ColorPickerProps) {
  return (
    <div
      className={cn(
        "bg-bg-white-0 flex flex-col gap-3 items-center justify-center p-4 relative rounded-xl w-[250px] shadow-lg border border-stroke-soft-200",
        className
      )}
      {...props}
    >
      {/* Header & Spectrum */}
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center justify-between h-9 w-full">
          <Button variant="ghost" size="md" className="px-2" rightIcon={<ChevronDown className="size-4" />}>
            Spectrum
          </Button>
          
          <Button variant="ghost" size="icon" className="size-8">
            <Settings2 className="size-4" />
          </Button>
        </div>
        
        {/* Spectrum Area Placeholder */}
        <div className="h-[200px] w-full relative rounded-lg overflow-hidden border border-stroke-soft-200">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/100 to-black/100 mix-blend-overlay" />
          
          {/* Picker thumb placeholder */}
          <div className="absolute top-8 left-12 size-4 border-2 border-white rounded-full shadow-sm" />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 w-full px-1">
        
        <div className="flex items-center gap-2 h-9 w-full">
          {/* Pipette */}
          <Button variant="ghost" size="icon" className="size-8 shrink-0 bg-bg-weak-50 hover:bg-bg-weak-100">
            <Pipette className="size-4" />
          </Button>
          
          {/* Sliders */}
          <div className="flex flex-col justify-center h-full w-full gap-2 relative">
            <div className="h-3 w-full rounded-full bg-gradient-to-r from-red-500 via-green-500 to-blue-500 relative border border-stroke-soft-200">
              <div className="absolute left-[30%] -ml-1.5 top-1/2 -translate-y-1/2 size-3 bg-white border border-stroke-soft-200 rounded-full shadow-sm" />
            </div>
            <div className="h-3 w-full rounded-full bg-gradient-to-r from-transparent to-blue-600 relative border border-stroke-soft-200">
              <div className="absolute left-[80%] -ml-1.5 top-1/2 -translate-y-1/2 size-3 bg-white border border-stroke-soft-200 rounded-full shadow-sm" />
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div className="flex items-center gap-2 w-full mt-1">
          <Button variant="ghost" size="md" className="px-2 bg-bg-weak-50 hover:bg-bg-weak-100 shrink-0" rightIcon={<ChevronDown className="size-4" />}>
            HEX
          </Button>
          
          <div className="flex flex-1 gap-1 items-center h-8 bg-bg-weak-50 rounded-lg px-2 border border-stroke-soft-200/50">
            <span className="text-sm font-normal text-text-strong-950 tracking-tight">
              {color}
            </span>
          </div>
          
          <div className="flex w-12 items-center justify-center h-8 bg-bg-weak-50 rounded-lg px-2 border border-stroke-soft-200/50">
            <span className="text-sm font-normal text-text-strong-950 tracking-tight">
              100%
            </span>
          </div>
        </div>
        
      </div>
    </div>
  );
}
