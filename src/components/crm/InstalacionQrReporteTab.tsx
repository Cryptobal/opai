"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Surface, Tag } from "@/components/opai-ds";

type QrRow = {
  id: string;
  serialLabel: string;
  status: string;
  publicUrl: string;
  assignedAt: string | null;
};

type Channel = {
  enabled: boolean;
  hasCoords: boolean;
  publicUrl: string | null;
  rotatedAt: string | null;
  installationName: string;
  address: string | null;
  installationCode: string | null;
  qrs: QrRow[];
};

export function InstalacionQrReporteTab({ installationId }: { installationId: string }) {
  const [data, setData] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/ops/installations/${installationId}/report-channel`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data);
      });
  }, [installationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(action: "enable" | "disable" | "rotate") {
    if (
      action === "rotate" &&
      !window.confirm("Retirar todos los QR asignados invalida los adhesivos impresos. ¿Continuar?")
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/installations/${installationId}/report-channel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo actualizar");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function unassign(qrId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/report-qrs/${qrId}/unassign`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo desasignar");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function download(format: "a4" | "sticker", qrId?: string) {
    const qs = new URLSearchParams({ format });
    if (qrId) qs.set("qrId", qrId);
    window.location.href = `/api/ops/installations/${installationId}/report-channel/pdf?${qs.toString()}`;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <Surface padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg">QR de reporte</h3>
            <p className="text-[13px] text-ds-text-3">
              Adhesivos físicos asignados a esta instalación. Los lotes se generan en{" "}
              <Link href="/ops/incidentes-terreno/qr" className="text-primary">
                Señalética QR
              </Link>
              .
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={data.enabled}
              disabled={busy || (!data.hasCoords && !data.enabled)}
              onChange={() => post(data.enabled ? "disable" : "enable")}
            />
            Canal activo
          </label>
        </div>
        {!data.hasCoords ? (
          <p className="text-[13px] text-status-warn-fg">
            Define latitud y longitud en la ficha antes de habilitar el canal. El reporte exige GPS contra el geofence.
          </p>
        ) : null}
        {error ? <p className="text-[13px] text-status-danger-fg">{error}</p> : null}
        {data.qrs.length === 0 ? (
          <p className="text-[13px] text-ds-text-3">
            No hay adhesivos asignados. Genera un lote, imprímelo y asígnalo escaneando el QR o desde el inventario.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.qrs.map((qr) => (
              <li
                key={qr.id}
                className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-mono text-[13px] font-semibold">{qr.serialLabel}</p>
                  <Tag variant="ok">Asignado</Tag>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-ds-border-default px-4 text-[13px]"
                    onClick={() => download("a4", qr.id)}
                  >
                    Afiche A4
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-ds-border-default px-4 text-[13px]"
                    onClick={() => download("sticker", qr.id)}
                  >
                    Adhesivo
                  </button>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-ds-border-default px-4 text-[13px] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => unassign(qr.id)}
                  >
                    Liberar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.qrs.length > 0 ? (
          <button
            type="button"
            className="min-h-11 rounded-xl border border-ds-border-default px-4 text-[13px] disabled:opacity-50"
            disabled={busy}
            onClick={() => post("rotate")}
          >
            Retirar todos los QR
          </button>
        ) : null}
      </Surface>
    </div>
  );
}
