"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Archive, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tag } from "@/components/opai-ds";
import { SECTION_LABELS, SECTION_ORDER } from "@/components/finance/flow-v3/grid-classes";
import type { FlowRowConfigItem } from "@/modules/finance/cashflow/flow-rows-config.service";
import type { AccountOption } from "./cashflow-config-types";
import { RowAccountsEditor } from "./RowAccountsEditor";

interface Props {
  row: FlowRowConfigItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountOptions: AccountOption[];
  saving?: boolean;
  onSave: (patch: {
    name?: string;
    section?: string;
  }) => Promise<void>;
  onDelete?: () => void;
  onArchive?: () => void;
  deleteBusy?: boolean;
}

export function RowConfigDrawer({
  row,
  open,
  onOpenChange,
  accountOptions,
  saving = false,
  onSave,
  onDelete,
  onArchive,
  deleteBusy = false,
}: Props) {
  if (!row) return null;
  const isIncome = row.section === "INGRESOS";
  const systemLocked = !!row.canonicalKey;
  const metaLocked = isIncome || systemLocked;
  /** Sistema: ver cuentas, no editar. Custom egreso: editable. */
  const canEditAccounts = !isIncome && !systemLocked;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display text-[15px]">Configurar renglón</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {row.canonicalKey && (
            <Tag variant="info" size="sm">
              Sistema · {row.canonicalKey}
            </Tag>
          )}
          <div>
            <Label className="text-[12px] text-ds-text-3">Nombre</Label>
            <Input
              className="h-10 sm:h-9 mt-1"
              defaultValue={row.name}
              disabled={saving || metaLocked}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== row.name) void onSave({ name: next });
              }}
            />
          </div>
          <div>
            <Label className="text-[12px] text-ds-text-3">Sección</Label>
            <Select
              value={row.section}
              disabled={saving || metaLocked}
              onValueChange={(v) => {
                if (v !== row.section) void onSave({ section: v });
              }}
            >
              <SelectTrigger className="h-10 sm:h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTION_ORDER.filter((s) => s !== "INGRESOS").map((s) => (
                  <SelectItem key={s} value={s}>
                    {SECTION_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {row.section !== "INGRESOS" && (
            <div>
              <Label className="text-[12px] text-ds-text-3">Cuentas contables</Label>
              <RowAccountsEditor
                rowId={row.id}
                accountOptions={accountOptions}
                initialAccounts={row.accounts}
                canEdit={canEditAccounts}
              />
              <p className="mt-2 text-[12px] text-ds-text-3">
                {systemLocked
                  ? "Renglón de sistema: la cuenta se muestra para referencia y no se edita aquí."
                  : "“Destino” = si un movimiento de cartola cae en esta cuenta y no hay otra regla, va a este renglón. Solo hace falta cuando dos renglones comparten la misma cuenta."}
              </p>
            </div>
          )}
          {!isIncome && (
            <div className="pt-4 mt-2 border-t border-ds-border-subtle space-y-2">
              <p className="text-[12px] text-ds-text-3">
                Archivar oculta el renglón hacia adelante y conserva el histórico.
                Eliminar solo es posible si no tiene plan, comprometido ni real.
              </p>
              {onArchive && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 sm:h-10"
                  disabled={saving || deleteBusy}
                  onClick={onArchive}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  Archivar renglón
                </Button>
              )}
              {onDelete && !systemLocked && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full h-11 sm:h-10"
                  disabled={saving || deleteBusy}
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar renglón
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
