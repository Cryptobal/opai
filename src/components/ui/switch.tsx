"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type SwitchSize = "sm" | "md" | "lg"

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  /** Tamaño del control. `md` (default) mantiene el look histórico del DS. */
  size?: SwitchSize
}

const TRACK_SIZE: Record<SwitchSize, string> = {
  sm: "h-4 w-7",
  md: "h-5 w-9",
  lg: "h-7 w-12",
}

const THUMB_SIZE: Record<SwitchSize, string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-6 w-6",
}

const THUMB_ON: Record<SwitchSize, string> = {
  sm: "translate-x-3",
  md: "translate-x-4",
  lg: "translate-x-5",
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, size = "md", ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        ref={ref}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange?.(!checked)}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          TRACK_SIZE[size],
          checked ? "bg-primary" : "bg-input",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform",
            THUMB_SIZE[size],
            checked ? THUMB_ON[size] : "translate-x-0"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
