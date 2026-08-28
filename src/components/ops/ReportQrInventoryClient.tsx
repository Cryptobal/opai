"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, QrCode, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-service";
import {
  Surface,
  Stat,
  StatGrid,
  Tag,
  EmptyState,
  Spinner,
  DataTable,
  type DataTableColumn,
} from "@/components/opai-ds";

type QrStatus = "unassigned" | "assigned" | "retired";

type QrItem = {
  id: string;
  serialLabel: string;
  status: QrStatus;
  assignedAt: string | null;
  createdAt: string;
  loteId: string;
  loteCode: string;
  installationId: string | null;
  installationName: string | null;
};

type LoteItem = {
  id: string;
  code: string;
  quantity: number;
  note: string | null;
  createdAt: string;
  counts: { unassigned: number; assigned: number; retired: number };
};

type InstOption = {
  id: string;
  name: string;
  address: string | null;
  hasCoords: boolean;
  distanceM: number | null;
};

function statusTag(status: QrStatus) {
  if (status === "assigned") return <Tag variant="ok">Asignado</Tag>;
  if (status === "retired") return <Tag variant="neutral">Retirado</Tag>;
  return <Tag variant="warn">Sin asignar</Tag>;
}

function QrRowActions({
  row,
  canEdit,
  busy,
  onAssign,
  onUnassign,
  onRetire,
  onDelete,
}: {
  row: QrItem;
  canEdit: boolean;
  busy: boolean;
  onAssign: () => void;
  onUnassign: () => void;
  onRetire: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <a
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ds-border-default px-3 text-[13px]"
        href={`/api/ops/report-qrs/${row.id}/pdf?format=sticker`}
      >
        PDF
      </a>
      {canEdit && row.status === "unassigned" ? (
        <Button type="button" variant="outline" className="min-h-11" onClick={onAssign}>
          Asignar
        </Button>
      ) : null}
      {canEdit && row.status === "assigned" ? (
        <>
          <Button type="button" variant="outline" className="min-h-11" onClick={onAssign}>
            Mover
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onUnassign}>
            Liberar
          </Button>
        </>
      ) : null}
      {canEdit && row.status !== "retired" ? (
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onRetire}>
          Retirar
        </Button>
      ) : null}
      {canEdit && row.status !== "assigned" ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 text-status-danger-fg border-status-danger-border"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Eliminar
        </Button>
      ) : null}
    </div>
  );
}

export function ReportQrInventoryClient({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<"all" | QrStatus>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<QrItem[]>([]);
  const [counts, setCounts] = useState({ unassigned: 0, assigned: 0, retired: 0, total: 0 });
  const [lotes, setLotes] = useState<LoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [loteQty, setLoteQty] = useState(50);
  const [loteNote, setLoteNote] = useState("");

  const [assignId, setAssignId] = useState<string | null>(null);
  const [instQuery, setInstQuery] = useState("");
  const [instOptions, setInstOptions] = useState<InstOption[]>([]);
  const [instLoading, setInstLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const [qrRes, loteRes] = await Promise.all([
      fetch(`/api/ops/report-qrs?${params.toString()}`),
      fetch("/api/ops/report-qrs/lotes"),
    ]);
    const qrJson = await qrRes.json();
    const loteJson = await loteRes.json();
    if (!qrRes.ok) throw new Error(qrJson.error ?? "No se pudo cargar el inventario");
    setItems(qrJson.data.items);
    setCounts(qrJson.data.counts);
    if (loteRes.ok) setLotes(loteJson.data ?? []);
  }, [status, q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function createLote() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/report-qrs/lotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: loteQty, note: loteNote.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar el lote");
      setLoteNote("");
      await load();
      window.location.href = `/api/ops/report-qrs/lotes/${json.data.loteId}/pdf`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function sendAction(url: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo completar la acción");
      setAssignId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function postAction(url: string, body?: unknown) {
    await sendAction(url, "POST", body);
  }

  async function deleteQr(row: QrItem) {
    if (
      !(await confirmDialog({
        title: "Eliminar QR",
        description: `Se eliminará ${row.serialLabel} de forma permanente. El adhesivo impreso dejará de funcionar.`,
        variant: "destructive",
        confirmLabel: "Eliminar",
      }))
    ) {
      return;
    }
    await sendAction(`/api/ops/report-qrs/${row.id}`, "DELETE");
  }

  async function deleteLote(lote: LoteItem) {
    if (lote.counts.assigned > 0) {
      setError(
        `No se puede eliminar ${lote.code}: ${lote.counts.assigned} QR ${lote.counts.assigned === 1 ? "sigue asignado" : "siguen asignados"}. Libéralos o retíralos primero.`,
      );
      return;
    }
    if (
      !(await confirmDialog({
        title: "Eliminar lote",
        description: `Se eliminarán ${lote.quantity} QR de ${lote.code}. Los adhesivos impresos dejarán de funcionar. No se puede deshacer.`,
        variant: "destructive",
        confirmLabel: "Eliminar lote",
      }))
    ) {
      return;
    }
    await sendAction(`/api/ops/report-qrs/lotes/${lote.id}`, "DELETE");
  }

  useEffect(() => {
    if (!assignId) return;
    const t = window.setTimeout(() => {
      setInstLoading(true);
      const params = new URLSearchParams();
      if (instQuery.trim()) params.set("q", instQuery.trim());
      fetch(`/api/ops/report-qrs/installations?${params.toString()}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.success) setInstOptions(j.data);
        })
        .finally(() => setInstLoading(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [assignId, instQuery]);

  const columns: DataTableColumn<QrItem>[] = useMemo(
    () => [
      { id: "serial", header: "Serial", cell: (row) => <span className="font-mono text-[13px]">{row.serialLabel}</span> },
      { id: "lote", header: "Lote", cell: (row) => <span className="text-[13px] text-ds-text-2">{row.loteCode}</span> },
      { id: "status", header: "Estado", cell: (row) => statusTag(row.status) },
      {
        id: "inst",
        header: "Instalación",
        cell: (row) => (
          <span className="text-[13px]">{row.installationName ?? "—"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: (row) => (
          <QrRowActions
            row={row}
            canEdit={canEdit}
            busy={busy}
            onAssign={() => { setAssignId(row.id); setInstQuery(""); }}
            onUnassign={() => postAction(`/api/ops/report-qrs/${row.id}/unassign`)}
            onRetire={() => {
              if (window.confirm(`¿Retirar ${row.serialLabel}? El adhesivo impreso deja de funcionar.`)) {
                postAction(`/api/ops/report-qrs/${row.id}/retire`, { reason: "Retirado desde inventario" });
              }
            }}
            onDelete={() => deleteQr(row)}
          />
        ),
      },
    ],
    [busy, canEdit],
  );

  return (
    <div className="space-y-6">
      <StatGrid cols={2} lgCols={4}>
        <Stat label="Total" value={counts.total} icon={QrCode} animate />
        <Stat label="Sin asignar" value={counts.unassigned} variant="warn" animate />
        <Stat label="Asignados" value={counts.assigned} variant="ok" animate />
        <Stat label="Retirados" value={counts.retired} animate />
      </StatGrid>

      {canEdit ? (
        <Surface padding="md" className="space-y-3">
          <h2 className="font-display text-lg">Generar lote</h2>
          <p className="text-[13px] text-ds-text-3">
            Crea adhesivos sin instalación. Imprímelos y asígnalos después escaneando el QR con sesión ERP o el dispositivo de terreno.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid min-w-[8rem] gap-1 text-[13px] font-medium">
              Cantidad
              <input
                type="number"
                min={1}
                max={100}
                value={loteQty}
                onChange={(e) => setLoteQty(Number(e.target.value))}
                className="h-11 sm:h-9 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3"
              />
            </label>
            <label className="grid flex-1 gap-1 text-[13px] font-medium">
              Nota (opcional)
              <input
                value={loteNote}
                onChange={(e) => setLoteNote(e.target.value)}
                maxLength={120}
                placeholder="Ej. caja recepción agosto"
                className="h-11 sm:h-9 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3"
              />
            </label>
            <Button type="button" className="min-h-11" disabled={busy} onClick={createLote}>
              <Plus className="mr-1 h-4 w-4" />
              Generar e imprimir
            </Button>
          </div>
        </Surface>
      ) : null}

      {lotes.length > 0 ? (
        <Surface padding="md" className="space-y-3">
          <h2 className="font-display text-lg">Lotes</h2>
          <ul className="ds-list-cascade space-y-2">
            {lotes.map((lote) => (
              <li key={lote.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ds-border-subtle px-3 py-3">
                <div>
                  <p className="font-mono text-[13px] font-semibold">{lote.code}</p>
                  <p className="text-[12px] text-ds-text-3">
                    {lote.quantity} QR · {lote.counts.unassigned} libres · {lote.counts.assigned} asignados
                    {lote.note ? ` · ${lote.note}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/ops/report-qrs/lotes/${lote.id}/pdf`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-ds-border-default px-3 text-[13px]"
                  >
                    <Printer className="h-4 w-4" />
                    PDF adhesivos
                  </a>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 text-status-danger-fg border-status-danger-border"
                      disabled={busy || lote.counts.assigned > 0}
                      title={
                        lote.counts.assigned > 0
                          ? "Libera o retira los QR asignados antes de eliminar el lote"
                          : "Eliminar lote y sus QR"
                      }
                      onClick={() => deleteLote(lote)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Eliminar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Surface>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">
          {(["all", "unassigned", "assigned", "retired"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`min-h-11 rounded-full px-4 text-[13px] ${
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "border border-ds-border-default text-ds-text-2"
              }`}
            >
              {s === "all" ? "Todos" : s === "unassigned" ? "Sin asignar" : s === "assigned" ? "Asignados" : "Retirados"}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar serial, lote o instalación"
          className="h-11 sm:h-9 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
        />
      </div>

      {error ? <p className="text-[13px] text-status-danger-fg">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No hay QR en este filtro"
          description="Genera un lote para imprimir adhesivos y asignarlos en terreno."
        />
      ) : (
        <>
          <div className="hidden sm:block">
            <DataTable columns={columns} rows={items} rowKey={(r) => r.id} />
          </div>
          <ul className="space-y-2 sm:hidden">
            {items.map((row) => (
              <li key={row.id}>
                <Surface padding="sm" className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[13px] font-semibold">{row.serialLabel}</p>
                      <p className="text-[12px] text-ds-text-3">{row.loteCode}</p>
                    </div>
                    {statusTag(row.status)}
                  </div>
                  <p className="text-[13px]">{row.installationName ?? "Sin instalación"}</p>
                  <QrRowActions
                    row={row}
                    canEdit={canEdit}
                    busy={busy}
                    onAssign={() => { setAssignId(row.id); setInstQuery(""); }}
                    onUnassign={() => postAction(`/api/ops/report-qrs/${row.id}/unassign`)}
                    onRetire={() => {
                      if (window.confirm(`¿Retirar ${row.serialLabel}? El adhesivo impreso deja de funcionar.`)) {
                        postAction(`/api/ops/report-qrs/${row.id}/retire`, { reason: "Retirado desde inventario" });
                      }
                    }}
                    onDelete={() => deleteQr(row)}
                  />
                </Surface>
              </li>
            ))}
          </ul>
        </>
      )}

      {assignId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <Surface padding="md" className="w-full max-w-md space-y-3">
            <h3 className="font-display text-lg">Asignar a instalación</h3>
            <input
              value={instQuery}
              onChange={(e) => setInstQuery(e.target.value)}
              placeholder="Buscar instalación"
              className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
              autoFocus
            />
            {instLoading ? <Spinner /> : null}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {instOptions.map((inst) => (
                <li key={inst.id}>
                  <button
                    type="button"
                    disabled={busy || !inst.hasCoords}
                    className="flex min-h-11 w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-ds-surface-2 disabled:opacity-50"
                    onClick={() => postAction(`/api/ops/report-qrs/${assignId}/assign`, { installationId: inst.id })}
                  >
                    <span className="text-[13px] font-medium">{inst.name}</span>
                    <span className="text-[12px] text-ds-text-3">
                      {inst.hasCoords ? inst.address ?? "Con GPS" : "Sin coordenadas GPS"}
                      {inst.distanceM != null ? ` · ${inst.distanceM} m` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setAssignId(null)}>
              Cancelar
            </Button>
            <p className="text-[12px] text-ds-text-3">
              En terreno también puedes escanear el adhesivo con el teléfono (sesión ERP o dispositivo de la instalación).
            </p>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
