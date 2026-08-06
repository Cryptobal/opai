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

interface Props {
  row: FlowRowConfigItem;
  readOnly?: boolean;
  accountOptions: AccountOption[];
  health: FlowHealthReportV2 | null;
  saving?: boolean;
  onOpenDrawer: (row: FlowRowConfigItem) => void;
  onRename: (rowId: string, name: string) => void;
}

export function FlowRowConfigListItem({
  row,
  readOnly = false,
  accountOptions,
  health,
  saving = false,
  onOpenDrawer,
  onRename,
}: Props) {
  const problem = rowHasProblem(row, health);

  if (readOnly) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-ds-md border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5 min-h-11">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ds-text-1 truncate">{row.name}</p>
          {row.crmAccountId && (
            <p className="text-[12px] text-ds-text-3">Vinculado a cuenta CRM</p>
          )}
        </div>
        <Tag variant="info" size="sm">
          Automático
        </Tag>
      </li>
    );
  }

  return (
    <li
      className={`rounded-ds-md border bg-ds-surface-1 p-3 ${
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
            {row.canonicalKey && (
              <Tag variant="neutral" size="sm">
                Sistema
              </Tag>
            )}
          </div>
          <Input
            className="h-10 sm:h-9 font-medium"
            defaultValue={row.name}
            disabled={saving || !!row.canonicalKey}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== row.name) onRename(row.id, next);
            }}
          />
          <RowAccountsEditor
            rowId={row.id}
            accountOptions={accountOptions}
            initialAccounts={row.accounts}
            canEdit={!row.canonicalKey}
            compact
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
