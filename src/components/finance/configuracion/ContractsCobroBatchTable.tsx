"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Tabla editable masiva del calendario de cobro por contrato.
 *
 * Usada en `/finanzas/configuracion/contratos-cobro` (vista temporal de
 * setup). Lista todos los items source=CONTRACT del tenant en una grilla
 * con inputs inline. El usuario edita N filas y luego clickea
 * "Guardar cambios" → PATCH batch al backend.
 *
 * Semántica de proforma (FIX 2 de Fase 3): cuando un item tiene
 * `emiteProforma=true`, los inputs "Día factura" y "Mes fact." quedan
 * deshabilitados (la fecha sale derivada de proforma + días). Al
 * marcar proforma en una fila, limpiamos esos campos en el state local
 * para que el usuario vea coherencia inmediata.
 */
type Row = {
  id: string;
  name: string;
  nickname: string | null;
  accountName: string | null;
  installationName: string | null;
  amount: number;
  currency: string;
  emiteProforma: boolean;
  diaEmisionProforma: number | null;
  diasFacturaDesdeProforma: number | null;
  diaEmisionFactura: number | null;
  mesFacturaRelativo: "MISMO_MES" | "MES_SIGUIENTE";
  modoCobro: "DIRECTO" | "FACTORING";
  diasCobroDesdeFactura: number;
};

export function ContractsCobroBatchTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/finance/cashflow/contracts-config");
      const json = await res.json();
      if (json.success) {
        setRows(json.data);
        setDirty(new Set());
      } else {
        toast.error(json.error ?? "Error cargando");
      }
    } catch {
      toast.error("Error de conexión");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateRow<K extends keyof Row>(
    id: string,
    field: K,
    value: Row[K],
  ) {
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.id !== id) return r;
            const next = { ...r, [field]: value };
            // Si se acaba de marcar proforma, limpiar campos que no aplican.
            if (field === "emiteProforma" && value === true) {
              next.diaEmisionFactura = null;
              next.mesFacturaRelativo = "MISMO_MES";
            }
            return next;
          })
        : prev,
    );
    setDirty((prev) => {
      const nextSet = new Set(prev);
      nextSet.add(id);
      return nextSet;
    });
  }

  async function handleSave() {
    if (!rows) return;
    const toSave = rows.filter((r) => dirty.has(r.id));
    if (toSave.length === 0) {
      toast.info("Sin cambios para guardar");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/cashflow/contracts-config/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: toSave.map((r) => ({
            id: r.id,
            nickname: r.nickname,
            emiteProforma: r.emiteProforma,
            diaEmisionProforma: r.diaEmisionProforma,
            diasFacturaDesdeProforma: r.diasFacturaDesdeProforma,
            diaEmisionFactura: r.diaEmisionFactura,
            mesFacturaRelativo: r.mesFacturaRelativo,
            modoCobro: r.modoCobro,
            diasCobroDesdeFactura: r.diasCobroDesdeFactura,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.data.updated} contratos actualizados`);
        await load();
      } else {
        toast.error(json.error ?? "Error guardando");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-ds-text-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-8 text-sm text-ds-text-3">
        No hay contratos activos en el flujo de caja.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-ds-text-3">
          {rows.length} contratos · {dirty.size} con cambios sin guardar
        </p>
        <Button onClick={handleSave} disabled={saving || dirty.size === 0}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Guardar cambios
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-ds-border-default">
        <table className="w-full text-sm">
          <thead className="bg-ds-surface-2 text-ds-text-3 text-[12px] uppercase tracking-wide">
            <tr>
              <th className="px-2 py-2 text-left">Contrato / Cliente</th>
              <th className="px-2 py-2 text-left">Nickname</th>
              <th className="px-2 py-2 text-left">Proforma</th>
              <th className="px-2 py-2 text-left">Día prof.</th>
              <th className="px-2 py-2 text-left">Días→factura</th>
              <th className="px-2 py-2 text-left">Día factura</th>
              <th className="px-2 py-2 text-left">Mes fact.</th>
              <th className="px-2 py-2 text-left">Modo cobro</th>
              <th className="px-2 py-2 text-left">Días cobro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // Si emite proforma, los campos diaFactura y mesFactura no
              // aplican (la fecha sale de proforma + días). Los deshabilitamos
              // visualmente para evitar inputs sin efecto.
              const facturaCamposDisabled = r.emiteProforma;
              const rowDirty = dirty.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-ds-border-default ${
                    rowDirty ? "bg-status-info-soft/30" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <div className="text-ds-text-1 font-medium text-xs">
                      {r.accountName ?? r.name}
                    </div>
                    <div className="text-ds-text-3 text-[12px]">
                      {r.installationName ?? "—"} · {r.currency}{" "}
                      {r.amount.toLocaleString("es-CL")}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={r.nickname ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, "nickname", e.target.value || null)
                      }
                      placeholder="—"
                      maxLength={100}
                      className="w-32 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={r.emiteProforma}
                      onChange={(e) =>
                        updateRow(r.id, "emiteProforma", e.target.checked)
                      }
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={r.diaEmisionProforma ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diaEmisionProforma",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={!r.emiteProforma}
                      title={
                        !r.emiteProforma
                          ? "Marcá Proforma para habilitar"
                          : ""
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={r.diasFacturaDesdeProforma ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diasFacturaDesdeProforma",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={!r.emiteProforma}
                      title={
                        !r.emiteProforma
                          ? "Marcá Proforma para habilitar"
                          : ""
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={r.diaEmisionFactura ?? ""}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diaEmisionFactura",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      disabled={facturaCamposDisabled}
                      title={
                        facturaCamposDisabled
                          ? "No aplica: con proforma la fecha sale de proforma + días"
                          : ""
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.mesFacturaRelativo}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "mesFacturaRelativo",
                          e.target.value as Row["mesFacturaRelativo"],
                        )
                      }
                      disabled={facturaCamposDisabled}
                      title={
                        facturaCamposDisabled
                          ? "No aplica: con proforma el mes sale natural"
                          : ""
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs disabled:opacity-40"
                    >
                      <option value="MISMO_MES">Mismo</option>
                      <option value="MES_SIGUIENTE">Siguiente</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={r.modoCobro}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "modoCobro",
                          e.target.value as Row["modoCobro"],
                        )
                      }
                      className="bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    >
                      <option value="DIRECTO">Directo</option>
                      <option value="FACTORING">Factoring</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={r.diasCobroDesdeFactura}
                      onChange={(e) =>
                        updateRow(
                          r.id,
                          "diasCobroDesdeFactura",
                          Number(e.target.value),
                        )
                      }
                      className="w-14 bg-ds-surface-1 border border-ds-border-default rounded px-1.5 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
