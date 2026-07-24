"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const baseClassName =
  "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ds-text-3 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1";

interface TopbarIconButtonProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Botón de icono unificado para la barra superior desktop.
 * Mantiene hit area y alineación consistentes entre buscar, chat, etc.
 */
export function TopbarIconButton({
  icon: Icon,
  label,
  onClick,
  href,
  className,
  children,
}: TopbarIconButtonProps) {
  const content = (
    <>
      <Icon className="h-4 w-4" aria-hidden />
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={cn(baseClassName, className)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(baseClassName, className)}
    >
      {content}
    </button>
  );
}
