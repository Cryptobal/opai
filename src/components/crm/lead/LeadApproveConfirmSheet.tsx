"use client";

import { Building2, Users, Briefcase, MapPin, Loader2, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LeadApproveConfirmSheet — confirmación de aprobación. Bottom sheet en mobile,
 * dialog centrado en desktop. Solo presentación: la llamada a la API la dispara
 * el parent vía onConfirm (mantiene la lógica de aprobación intacta).
 */
export interface LeadApproveConfirmItem {
  entity: "account" | "contact" | "deal" | "installations";
  label: string;
  badge: "nueva" | "existente" | "mantener";
  count?: number;
}

export interface LeadApproveConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: LeadApproveConfirmItem[];
  approving: boolean;
  hasConflicts: boolean;
  onConfirm: () => void;
}

const ICONS: Record<LeadApproveConfirmItem["entity"], LucideIcon> = {
  account: Building2,
  contact: Users,
  deal: Briefcase,
  installations: MapPin,
};

const BADGE_CLASS: Record<LeadApproveConfirmItem["badge"], string> = {
  nueva: "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
  existente: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
  mantener: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
};

export function LeadApproveConfirmSheet({
  open,
  onOpenChange,
  items,
  approving,
  hasConflicts,
  onConfirm,
}: LeadApproveConfirmSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:bottom-0 max-sm:top-auto max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl">
        <DialogHeader>
          <DialogTitle>Confirmar y crear</DialogTitle>
          <DialogDescription>
            {hasConflicts
              ? "Hay conflictos resueltos. Al confirmar se crearán o vincularán:"
              : "Al confirmar se crearán los siguientes registros:"}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-1">
          {items.map((it) => {
            const Icon = ICONS[it.entity];
            return (
              <li key={it.entity} className="flex items-center gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ds-surface-3 text-ds-text-2">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{it.label}</span>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", BADGE_CLASS[it.badge])}>
                  {it.count != null ? `${it.count} ${it.badge}` : it.badge}
                </span>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={approving} className="min-h-11">
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={approving}
            className={cn("min-h-11 gap-1.5 font-medium text-white", hasConflicts ? "bg-status-warn hover:brightness-110" : "bg-status-ok hover:brightness-110")}
          >
            {approving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {approving ? "Creando…" : "Confirmar y crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
