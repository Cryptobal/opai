"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { tintClasses, type EntityTint } from "@/lib/entity-tint";

export interface EntityRowProps {
  /** Tint del cliente/entidad → barra de acento + hint visual. */
  tint?: EntityTint;
  /** Típicamente <Avatar variant="tint" shape="square" />. */
  avatar?: ReactNode;
  /** Rol ds-title, truncado. */
  title: ReactNode;
  /** Badges junto al título (cliente, alertas). */
  titleAside?: ReactNode;
  /** Rol ds-caption, truncado. */
  subtitle?: ReactNode;
  /** Bloque derecho (dotación, cumplimiento, estado). En mobile se oculta salvo estado. */
  meta?: ReactNode;
  /** Si existe, envuelve en <Link>; si no, <div> o button según onClick. */
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

/**
 * EntityRow — fila de listado con acento de identidad, avatar, título y meta.
 * Acento vía box-shadow inset (no border-left) para evitar layout shift.
 */
export function EntityRow({
  tint,
  avatar,
  title,
  titleAside,
  subtitle,
  meta,
  href,
  onClick,
  selected = false,
  className,
}: EntityRowProps) {
  const rail = tint ? tintClasses(tint).rail : undefined;

  const body = (
    <>
      {avatar ? <div className="shrink-0">{avatar}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-ds-title text-ds-text-1 truncate min-w-0" title={typeof title === "string" ? title : undefined}>
            {title}
          </span>
          {titleAside ? (
            <div className="flex items-center gap-1.5 shrink-0 min-w-0">{titleAside}</div>
          ) : null}
        </div>
        {subtitle ? (
          <div className="text-ds-caption text-ds-text-3 truncate mt-0.5 min-w-0">
            {subtitle}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="hidden sm:flex items-center gap-2 shrink-0 text-ds-caption text-ds-text-3">
          {meta}
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    "group flex w-full items-center gap-3 min-h-[56px] [[data-density=compact]_&]:min-h-[44px]",
    "px-3 py-2 rounded-r-ds-md rounded-l-none",
    "transition-colors duration-fast motion-reduce:transition-none",
    "hover:bg-ds-surface-2",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    selected && "bg-primary/15 hover:bg-primary/20",
    rail,
    className,
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={classes}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "text-left")}>
        {body}
      </button>
    );
  }

  return <div className={classes}>{body}</div>;
}
