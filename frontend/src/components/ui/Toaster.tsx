"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-bg-white-0 group-[.toaster]:text-text-strong-950 group-[.toaster]:border-stroke-soft-200 group-[.toaster]:shadow-lg font-inter rounded-panel",
          description: "group-[.toast]:text-text-soft-400",
          actionButton:
            "group-[.toast]:bg-primary-base group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-bg-weak-50 group-[.toast]:text-text-sub-600",
          error: "group-[.toaster]:bg-state-danger-light group-[.toaster]:text-state-danger-dark group-[.toaster]:border-state-danger-border",
          success: "group-[.toaster]:bg-state-success-bg group-[.toaster]:text-state-success-dark group-[.toaster]:border-state-success-light",
        },
      }}
    />
  );
}
