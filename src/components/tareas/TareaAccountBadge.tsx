"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

/**
 * Badge de cuenta CRM en tareas.
 * - idle: tono info (celeste), distinto de origen/fecha grises.
 * - active: tono brand (al enfocar/abrir el campo Cuenta).
 */
export function TareaAccountBadge({
  accountId,
  name,
  active = false,
  href,
  onClick,
  className,
  size = "sm",
}: {
  accountId?: string | null;
  name: string;
  /** true al entrar/enfocar el campo Cuenta. */
  active?: boolean;
  href?: string | null;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const label = name.trim();
  if (!label) return null;

  const tag = (
    <Tag
      variant={active ? "brand" : "info"}
      size={size}
      icon={Building2}
      className={cn(
        "max-w-[10rem] shrink-0",
        active && "ring-1 ring-primary/40",
        className,
      )}
    >
      <span className="truncate">{label}</span>
    </Tag>
  );

  if (href || accountId) {
    return (
      <Link
        href={href ?? `/crm/accounts/${accountId}`}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
        className="inline-flex max-w-full min-w-0"
        title={label}
      >
        {tag}
      </Link>
    );
  }

  return (
    <span className="inline-flex max-w-full min-w-0" title={label}>
      {tag}
    </span>
  );
}
