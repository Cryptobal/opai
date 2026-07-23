"use client";

import * as React from "react";
import {
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Modelo de ítems compartido entre el menú contextual (botón derecho /
 * long-press) y el dropdown del botón MoreHorizontal — el mismo contenido se
 * renderiza con los primitivos de Radix ContextMenu o DropdownMenu según la
 * variante, sin duplicar la lógica. Ítems inaplicables van DESHABILITADOS con
 * su motivo, nunca ocultos (§5C/§5D).
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
          {labelWithReason(it.label, it.disabled ? it.reason : undefined)}
        </C.Item>,
      );
    }
  }
  return out;
}

export function MenuItems({
  items,
  variant,
}: {
  items: MenuItemDesc[];
  variant: "context" | "dropdown";
}) {
  return <>{renderItems(items, variant === "context" ? CONTEXT_BAG : DROPDOWN_BAG)}</>;
}
