"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/opai-ds";
import { tintFromId, type EntityTint } from "@/lib/entity-tint";

/**
 * RecordCollapse — área colapsable del header de ficha.
 *
 * Colapsa con `grid-template-rows: 1fr → 0fr` (no desmonta hijos: el estado
 * de inputs/popovers dentro del header se preserva). `motion-reduce` elimina
 * la transición para respetar `prefers-reduced-motion`.
 */
export function RecordCollapse({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
      )}
      aria-hidden={collapsed || undefined}
    >
      <div className={cn("min-h-0 overflow-hidden", collapsed && "pointer-events-none")}>{children}</div>
    </div>
  );
}

/**
 * RecordMiniTitle — mini-título (avatar tint 22px + nombre) que aparece en el
 * strip de tabs cuando el header está colapsado, con fade/expand horizontal.
 */
export function RecordMiniTitle({
  collapsed,
  title,
  entityId,
  photoUrl,
  initials,
}: {
  collapsed: boolean;
  title: string;
  entityId?: string;
  photoUrl?: string | null;
  initials?: string;
}) {
  const tint: EntityTint | undefined = entityId ? tintFromId(entityId) : undefined;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        collapsed ? "max-w-[170px] opacity-100 mr-2" : "max-w-0 opacity-0"
      )}
      aria-hidden={!collapsed || undefined}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          className="h-[22px] w-[22px] shrink-0 rounded-full border border-ds-border-default bg-background object-contain"
        />
      ) : (
        <Avatar
          variant={tint ? "tint" : "default"}
          tint={tint}
          size="sm"
          initials={initials}
          name={title}
          className="h-[22px] w-[22px] shrink-0 text-[10px]"
        />
      )}
      <span className="truncate text-[12px] font-medium text-ds-text-1">{title}</span>
    </div>
  );
}
