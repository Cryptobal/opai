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
  /** Resalta visualmente la semana inmediatamente siguiente a la celda activa. */
  highlight?: "next-week";
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
          className={cn(
            it.danger && "text-status-danger-fg",
            it.highlight === "next-week" && "bg-status-info-soft font-medium text-status-info-fg",
          )}
        >
          {labelWithReason(it.label, it.reason)}
        </C.Item>,
      );
    }
  }
  return out;
}

/** Render sheet: botones táctiles con drill-down de submenús. */
function SheetMenuItems({
  items,
  onClose,
}: {
  items: MenuItemDesc[];
  onClose: () => void;
}) {
  const [stack, setStack] = useState<{ title: string; items: MenuItemDesc[] }[]>([]);
  const current = stack.length > 0 ? stack[stack.length - 1]! : null;
  const list = current?.items ?? items;

  return (
    <div className="divide-y divide-ds-border-subtle">
      {current && (
        <button
          type="button"
          onClick={() => setStack((s) => s.slice(0, -1))}
          className="flex w-full min-h-11 items-center gap-2 px-5 py-3 text-left text-[13px] text-ds-text-2 active:bg-ds-surface-2"
        >
          ← {current.title}
        </button>
      )}
      {list.map((it) => {
        if (it.submenu && it.submenu.length > 0) {
          return (
            <React.Fragment key={it.key}>
              {it.separatorBefore && <div className="h-2 bg-ds-surface-2" />}
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
                className={cn(
                  "flex w-full min-h-11 items-center gap-3 px-5 py-3 text-left active:bg-ds-surface-2",
                  it.disabled && "pointer-events-none opacity-40",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium text-ds-text-1">{it.label}</span>
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
            {it.separatorBefore && <div className="h-2 bg-ds-surface-2" />}
            <button
              type="button"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled || !it.onSelect) return;
                onClose();
                it.onSelect();
              }}
              className={cn(
                "flex w-full min-h-11 items-center px-5 py-3 text-left active:bg-ds-surface-2",
                it.disabled && "pointer-events-none opacity-40",
                it.highlight === "next-week" && "bg-status-info-soft",
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[14px] font-medium",
                    it.danger
                      ? "text-status-danger-fg"
                      : it.highlight === "next-week"
                        ? "text-status-info-fg"
                        : "text-ds-text-1",
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
  variant: "context" | "dropdown" | "sheet";
  /** Requerido cuando variant=sheet: cierra el Sheet al seleccionar. */
  onSheetClose?: () => void;
}) {
  if (variant === "sheet") {
    return <SheetMenuItems items={items} onClose={onSheetClose ?? (() => {})} />;
  }
  return <>{renderItems(items, variant === "context" ? CONTEXT_BAG : DROPDOWN_BAG)}</>;
}
