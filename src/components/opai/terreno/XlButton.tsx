"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type XlButtonVariant = "teal" | "dark" | "ok" | "bad" | "ghost";
export type XlButtonSize = "md" | "lg" | "xl";

export interface XlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: XlButtonVariant;
  size?: XlButtonSize;
  icon?: ReactNode;
  children: ReactNode;
}

const VARIANT: Record<XlButtonVariant, string> = {
  teal: "bg-primary text-primary-foreground border-primary",
  dark: "bg-ds-surface-2 text-ds-text-1 border-ds-border-default",
  ok: "bg-status-ok text-white border-status-ok",
  bad: "bg-status-danger text-white border-status-danger",
  ghost: "bg-transparent text-ds-text-1 border-ds-border-default",
};

const SIZE: Record<XlButtonSize, string> = {
  md: "min-h-[64px] text-base px-5",
  lg: "min-h-[80px] text-lg px-6",
  xl: "min-h-[96px] text-xl px-6",
};

export function XlButton({
  variant = "teal",
  size = "md",
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: XlButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-3 rounded-2xl border-2 font-display font-bold tracking-wide",
        "transition-transform motion-safe:active:scale-[0.97] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:opacity-40 disabled:pointer-events-none",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon ? <span className="shrink-0 [&_svg]:h-7 [&_svg]:w-7">{icon}</span> : null}
      <span className="leading-tight">{children}</span>
    </button>
  );
}
