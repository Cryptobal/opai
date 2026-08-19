"use client";

import * as React from "react";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Modelo de ítems compartido entre el menú contextual (botón derecho /
 * long-press) y el dropdown del botón MoreHorizontal — el mismo contenido se
 * renderiza con los primitivos de Radix ContextMenu o DropdownMenu según la
 * variante, sin duplicar la lógica. Ítems inaplicables van DESHABILITADOS con
 * su motivo, nunca ocultos (§5C/§5D).
 *
 * Variante "sheet": botones táctiles ≥44px para CellActionSheet móvil.
 */
export interface MenuItemDesc {
  key: string;
  label: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  reason?: string;
  danger?: boolean;
  separatorBefore?: boolean;
  submenu?: MenuItemDesc[];
}

type Bag = {
  Item: typeof ContextMenuItem;
  Sub: typeof ContextMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent;
  Separator: typeof ContextMenuSeparator;
};

const CONTEXT_BAG: Bag = {
  Item: ContextMenuItem,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  Separator: ContextMenuSeparator,
};

const DROPDOWN_BAG: Bag = {
  Item: DropdownMenuItem as unknown as typeof ContextMenuItem,
  Sub: DropdownMenuSub as unknown as typeof ContextMenuSub,
  SubTrigger: DropdownMenuSubTrigger as unknown as typeof ContextMenuSubTrigger,
  SubContent: DropdownMenuSubContent as unknown as typeof ContextMenuSubContent,
  Separator: DropdownMenuSeparator as unknown as typeof ContextMenuSeparator,
};

function labelWithReason(label: React.ReactNode, reason?: string): React.ReactNode {
  if (!reason) return label;
  return (
    <span className="flex flex-col gap-0.5">
      <span>{label}</span>
      <span className="text-[12px] leading-tight text-ds-text-4">{reason}</span>
    </span>
  );
}

function renderItems(items: MenuItemDesc[], C: Bag): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (const it of items) {
    if (it.separatorBefore) out.push(<C.Separator key={`${it.key}-sep`} />);
    if (it.submenu && it.submenu.length > 0) {
      out.push(
        <C.Sub key={it.key}>
          <C.SubTrigger disabled={it.disabled}>{it.label}</C.SubTrigger>
          <C.SubContent className="max-h-72 overflow-y-auto">
            {renderItems(it.submenu, C)}
          </C.SubContent>
        </C.Sub>,
      );
    } else {
      out.push(
        <C.Item
          key={it.key}
          disabled={it.disabled}
          onSelect={it.onSelect ? () => it.onSelect!() : undefined}
          className={it.danger ? "text-status-danger-fg" : undefined}
        >
          {labelWithReason(it.label, it.reason)}
        </C.Item>,
      );
    }
  }
  return out;
}

/** Render sheet/panel: botones con drill-down de submenús. */
function SheetMenuItems({
  items,
  onClose,
  density = "sheet",
}: {
  items: MenuItemDesc[];
  onClose: () => void;
  density?: "sheet" | "panel";
}) {
  const [stack, setStack] = useState<{ title: string; items: MenuItemDesc[] }[]>([]);
  const current = stack.length > 0 ? stack[stack.length - 1]! : null;
  const list = current?.items ?? items;
  const compact = density === "panel";
  const btn = compact
    ? "flex w-full min-h-10 sm:min-h-9 items-center gap-2 rounded px-1.5 py-1.5 text-left hover:bg-ds-surface-2"
    : "flex w-full min-h-11 items-center gap-3 px-5 py-3 text-left active:bg-ds-surface-2";
  const labelClass = compact ? "block text-[13px] font-medium" : "block text-[14px] font-medium";

  return (
    <div className={compact ? "space-y-0.5" : "divide-y divide-ds-border-subtle"}>
      {current && (
        <button
          type="button"
          onClick={() => setStack((s) => s.slice(0, -1))}
          className={cn(btn, compact ? "text-ds-text-2" : "text-[13px] text-ds-text-2")}
        >
          ← {current.title}
        </button>
      )}
      {list.map((it) => {
        if (it.submenu && it.submenu.length > 0) {
          return (
            <React.Fragment key={it.key}>
              {it.separatorBefore && !compact && <div className="h-2 bg-ds-surface-2" />}
              {it.separatorBefore && compact && (
                <div className="my-1 border-t border-ds-border-subtle" />
              )}
              <button
                type="button"
                disabled={it.disabled}
                onClick={() => {
                  if (it.disabled) return;
                  setStack((s) => [
                    ...s,
                    { title: typeof it.label === "string" ? it.label : "Más", items: it.submenu! },
                  ]);
                }}
                className={cn(btn, it.disabled && "pointer-events-none opacity-40")}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn(labelClass, "text-ds-text-1")}>{it.label}</span>
                  {it.reason && it.disabled && (
                    <span className="block text-[12px] text-ds-text-4">{it.reason}</span>
                  )}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" />
              </button>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={it.key}>
            {it.separatorBefore && !compact && <div className="h-2 bg-ds-surface-2" />}
            {it.separatorBefore && compact && (
              <div className="my-1 border-t border-ds-border-subtle" />
            )}
            <button
              type="button"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled || !it.onSelect) return;
                onClose();
                it.onSelect();
              }}
              className={cn(btn, it.disabled && "pointer-events-none opacity-40")}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    labelClass,
                    it.danger ? "text-status-danger-fg" : "text-ds-text-1",
                  )}
                >
                  {it.label}
                </span>
                {it.reason && it.disabled && (
                  <span className="block text-[12px] text-ds-text-4">{it.reason}</span>
                )}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function MenuItems({
  items,
  variant,
  onSheetClose,
}: {
  items: MenuItemDesc[];
  variant: "context" | "dropdown" | "sheet" | "panel";
  /** Requerido cuando variant=sheet|panel: cierra el overlay al seleccionar. */
  onSheetClose?: () => void;
}) {
  if (variant === "sheet") {
    return <SheetMenuItems items={items} onClose={onSheetClose ?? (() => {})} density="sheet" />;
  }
  if (variant === "panel") {
    return <SheetMenuItems items={items} onClose={onSheetClose ?? (() => {})} density="panel" />;
  }
  return <>{renderItems(items, variant === "context" ? CONTEXT_BAG : DROPDOWN_BAG)}</>;
}
