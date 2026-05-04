"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChannelToggleProps {
  icon: ReactNode;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function ChannelToggle({ icon, checked, disabled, onChange, label }: ChannelToggleProps) {
  return (
    <label
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded-md border transition-colors cursor-pointer",
        disabled && "opacity-30 cursor-not-allowed",
        !disabled && checked && "bg-primary text-primary-foreground border-primary",
        !disabled &&
          !checked &&
          "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
      title={label}
      aria-label={label}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {icon}
    </label>
  );
}
