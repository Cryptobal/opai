"use client";

import { MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/opai-ds";
import type { FlowRowConfigItem } from "@/modules/finance/cashflow/flow-rows-config.service";
import type { AccountOption } from "./cashflow-config-types";
import { RowAccountsEditor } from "./RowAccountsEditor";
import { rowHasProblem } from "./flow-row-config-helpers";
import type { FlowHealthReportV2 } from "@/modules/finance/cashflow/flow-health.types";
import { filterAccountOptionsForSection } from "@/components/finance/flow-v3/account-options-for-section";

interface Props {
  row: FlowRowConfigItem;
  readOnly?: boolean;
  accountOptions: AccountOption[];
  health: FlowHealthReportV2 | null;
  saving?: boolean;
  onOpenDrawer: (row: FlowRowConfigItem) => void;
  onRename: (rowId: string, name: string) => void;
  onAccountsChanged?: () => void;
}

function isBandejaKey(key: string | null): boolean {
  return key === "BANDEJA_EGRESO" || key === "BANDEJA_INGRESO";
}

export function FlowRowConfigListItem({
  row,
  readOnly = false,
  accountOptions,
  health,
  saving = false,
  onOpenDrawer,
  onRename,
  onAccountsChanged,
}: Props) {
  const problem = rowHasProblem(row, health);
  const systemLocked = !!row.canonicalKey;
  /** Sistema: cuentas visibles pero no editables. Custom: editables. */
  const canEditAccounts = !systemLocked && !isBandejaKey(row.canonicalKey);
  const scopedAccountOptions = filterAccountOptionsForSection(
    accountOptions.map((a) => ({
      id: a.id,
      code: a.code,
      type: a.type ?? "",
      label: `${a.code} · ${a.name}`,
    })),
    row.section,
  ).map((a) => {
    const src = accountOptions.find((o) => o.id === a.id)!;
    return { id: src.id, code: src.code, name: src.name, type: src.type };
  });

  if (readOnly) {
    return (
      <li className="rounded-ds-md border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5 min-h-11 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ds-text-1 truncate">{row.name}</p>
            {row.crmAccountId && (
              <p className="text-[12px] text-ds-text-3">Vinculado a cuenta CRM</p>
            )}
          </div>
          <Tag variant="info" size="sm">
            Automático
          </Tag>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-ds-md border bg-ds-surface-1 p-3 relative ${
        problem ? "border-status-warn-border" : "border-ds-border-default"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {problem && (
              <Tag variant="warn" size="sm">
                Revisar
              </Tag>
            )}
            {systemLocked && (
              <Tag variant="neutral" size="sm">
                Sistema
              </Tag>
            )}
          </div>
          <Input
            className="h-10 sm:h-9 font-medium"
            defaultValue={row.name}
            disabled={saving || systemLocked}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== row.name) onRename(row.id, next);
            }}
          />
          <RowAccountsEditor
            rowId={row.id}
            accountOptions={scopedAccountOptions}
            initialAccounts={row.accounts}
            canEdit={canEditAccounts}
            compact
            onSaved={() => onAccountsChanged?.()}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-9 sm:w-9 shrink-0"
          aria-label="Más opciones"
          onClick={() => onOpenDrawer(row)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
