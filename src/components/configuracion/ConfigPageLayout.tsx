"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigPageLayoutProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function ConfigPageLayout({
  title,
  description,
  icon: Icon,
  actions,
  children,
  backHref = "/opai/configuracion",
  backLabel = "Configuración",
  className,
}: ConfigPageLayoutProps) {
  return (
    <div className={cn("space-y-5 min-w-0", className)}>
      <div className="space-y-1">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-primary/80 hover:text-primary transition-colors mb-1 -ml-0.5"
        >
          <ChevronLeft className="h-4 w-4" />
          <span>{backLabel}</span>
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-[18px] w-[18px]" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{title}</h1>
              {description && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
          )}
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mt-3" />
      </div>
      {children}
    </div>
  );
}
