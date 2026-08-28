"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ShieldAlert, Users } from "lucide-react";
import {
  EmptyState,
  Spinner,
  Surface,
  Tag,
} from "@/components/opai-ds";
import {
  FINANCIAL_AUDIT_COLUMNS,
  type FinancialAuditRow,
} from "@/lib/financial-access";

const MATRIX_COLUMNS = FINANCIAL_AUDIT_COLUMNS;

function AccessBadge({ ok }: { ok: boolean }) {
  return (
    <Tag variant={ok ? "ok" : "danger"} size="sm" className="justify-center min-w-[3rem]">
      {ok ? "Sí" : "No"}
    </Tag>
  );
}

function toCsv(rows: FinancialAuditRow[]): string {
  const headers = [
    "email",
    "name",
    "role",
    "template",
    ...MATRIX_COLUMNS.map((c) => c.key),
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const cells = [
      row.email,
      row.name,
      row.role,
      row.templateName ?? "",
      ...MATRIX_COLUMNS.map((c) => (row.matrix[c.key] ? "si" : "no")),
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function RoleFinancialAuditClient() {
  const [rows, setRows] = useState<FinancialAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/role-audit");
        const json = (await res.json()) as { success?: boolean; data?: FinancialAuditRow[]; error?: string };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "No se pudo cargar la auditoría");
        }
        if (!cancelled) setRows(json.data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withFinance = useMemo(
    () => rows?.filter((r) => Object.entries(r.matrix).some(([k, v]) => k !== "rendiciones" && v)).length ?? 0,
    [rows],
  );

  function downloadCsv() {
    if (!rows) return;
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auditoria-acceso-financiero.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return (
      <EmptyState
        icon={ShieldAlert}
        tone="warn"
        title="No se pudo cargar la auditoría"
        description={error}
      />
    );
  }

  if (!rows) {
    return (
      <Surface elevation={1} padding="lg" className="flex items-center justify-center min-h-[12rem]">
        <Spinner />
      </Surface>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Sin usuarios activos"
        description="No hay usuarios activos en este tenant para auditar."
      />
    );
  }

  return (
    <div className="ds-page-enter space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-ds-text-3">
          {rows.length} usuario{rows.length === 1 ? "" : "s"} activo{rows.length === 1 ? "" : "s"}
          {" · "}
          {withFinance} con acceso a cifras de empresa (post-lock)
        </p>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex h-10 sm:h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      <Surface elevation={1} padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-ds-border-subtle">
                <th className="sticky left-0 z-10 bg-ds-surface-1 px-3 py-3 text-left text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                  Usuario
                </th>
                <th className="px-3 py-3 text-left text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                  Rol
                </th>
                <th className="px-3 py-3 text-left text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                  Template
                </th>
                {MATRIX_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-2 py-3 text-center text-[12px] font-medium uppercase tracking-wide text-ds-text-3"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ds-border-subtle last:border-0">
                  <td className="sticky left-0 z-10 bg-ds-surface-1 px-3 py-2.5">
                    <div className="font-medium text-ds-text-1 truncate max-w-[14rem]">{row.name}</div>
                    <div className="text-[12px] text-ds-text-3 truncate max-w-[14rem]">{row.email}</div>
                  </td>
                  <td className="px-3 py-2.5 text-ds-text-2 whitespace-nowrap">{row.role}</td>
                  <td className="px-3 py-2.5 text-ds-text-2 whitespace-nowrap">
                    {row.templateName ?? "—"}
                  </td>
                  {MATRIX_COLUMNS.map((col) => (
                    <td key={col.key} className="px-2 py-2.5 text-center">
                      <AccessBadge ok={row.matrix[col.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}
