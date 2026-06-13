"use client";

import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-stroke-soft-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/20 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-white-0 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-base data-[state=unchecked]:bg-stroke-soft-200",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block size-3 rounded-full bg-white shadow-[0px_1px_2px_rgba(10,13,20,0.18)] ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-1"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
