"use client";

import { Button } from "@/components/ui/button";
import { Surface, Tag } from "@/components/opai-ds";

export type EligibleRow = {
  id: string;
  name: string;
  email: string | null;
  installationName: string | null;
  skipReason: string | null;
  excluded?: boolean;
};

export function BulkAudienceStep({
  audience,
  onAudience,
  installationIds,
  onInstallations,
  rows,
  onRows,
  working,
  onBack,
  onReload,
  onNext,
}: {
  audience: "all_active" | "installations" | "manual";
  onAudience: (a: "all_active" | "installations" | "manual") => void;
  installationIds: string[];
  onInstallations: (ids: string[]) => void;
  rows: EligibleRow[];
  onRows: (rows: EligibleRow[]) => void;
  working: boolean;
  onBack: () => void;
  onReload: () => void;
  onNext: () => void;
}) {
  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <p className="font-medium">2. Destinatarios</p>
      <div className="flex flex-wrap gap-3 text-[13px]">
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={audience === "all_active"} onChange={() => onAudience("all_active")} />
          Todos los activos
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={audience === "installations"} onChange={() => onAudience("installations")} />
          Por instalación
        </label>
      </div>
      {audience === "installations" && installationIds.length === 0 && (
        <p className="text-[13px] text-status-warn-fg">Abre el wizard desde una instalación o recarga tras seleccionar.</p>
      )}
      <Button variant="outline" className="min-h-11" disabled={working} onClick={onReload}>Actualizar lista</Button>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead className="text-left text-ds-text-3">
            <tr>
              <th className="px-2 py-1">Enviar</th>
              <th className="px-2 py-1">Guardia</th>
              <th className="px-2 py-1">Instalación</th>
              <th className="px-2 py-1">Contacto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-ds-border-subtle">
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    disabled={Boolean(row.skipReason)}
                    checked={!row.excluded && !row.skipReason}
                    onChange={(e) => onRows(rows.map((r) => r.id === row.id ? { ...r, excluded: !e.target.checked } : r))}
                  />
                </td>
                <td className="px-2 py-1">{row.name}</td>
                <td className="px-2 py-1">{row.installationName ?? "—"}</td>
                <td className="px-2 py-1">
                  {row.skipReason ? <Tag size="sm" variant="warn">{row.skipReason}</Tag> : row.email}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="min-h-11" onClick={onBack}>Atrás</Button>
        <Button className="min-h-11" disabled={working} onClick={onNext}>Resumen</Button>
      </div>
    </Surface>
  );
}
