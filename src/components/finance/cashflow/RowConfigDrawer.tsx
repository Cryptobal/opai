"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
}

export function RowConfigDrawer({
  row,
  open,
  onOpenChange,
  accountOptions,
  saving = false,
  onSave,
}: Props) {
  if (!row) return null;
  const readOnly = row.section === "INGRESOS" || !!row.canonicalKey;

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
              disabled={saving || readOnly}
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
              disabled={saving || readOnly}
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
                canEdit={!readOnly}
              />
              <p className="mt-2 text-[12px] text-ds-text-3">
                La cuenta principal contabiliza el egreso. Marcá <strong>destino</strong> si
                varios renglones comparten la misma cuenta.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
