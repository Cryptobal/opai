"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleGuard } from "../RoleGuard";
import type { LifecycleAction } from "@/lib/platform/tenant-lifecycle";

export interface LifecycleItem {
  action: LifecycleAction;
  label: string;
  requiresReason: boolean;
}

export function LifecycleMenu({
  items,
  onSelect,
}: {
  items: LifecycleItem[];
  onSelect: (item: LifecycleItem) => void;
}) {
  return (
    <RoleGuard minRole="admin">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" className="h-10 sm:h-9" disabled={!items.length}>
            Ciclo de vida
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item) => (
            <DropdownMenuItem key={item.action} onSelect={() => onSelect(item)}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </RoleGuard>
  );
}

export function OverflowMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <RoleGuard minRole="owner">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10 sm:h-9 sm:w-9" aria-label="Más">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-status-danger-fg" onSelect={onDelete}>
            Eliminar tenant
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </RoleGuard>
  );
}
