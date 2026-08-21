"use client";

import { useCallback, useEffect, useState } from "react";
import { Surface } from "@/components/opai-ds";

type Channel = {
  enabled: boolean;
  hasCoords: boolean;
  publicUrl: string | null;
  rotatedAt: string | null;
  installationName: string;
  address: string | null;
  installationCode: string | null;
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
    if (action === "rotate" && !window.confirm("Rotar el token invalida el QR impreso. ¿Continuar?")) {
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

  function download(format: "a4" | "sticker") {
    window.location.href = `/api/ops/installations/${installationId}/report-channel/pdf?format=${format}`;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <Surface padding="md" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg">QR de reporte</h3>
            <p className="text-[13px] text-ds-text-3">
              Canal público para que visitas y personal del cliente reporten incidentes sin app.
            </p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={data.enabled}
              disabled={busy || (!data.hasCoords && !data.enabled)}
              onChange={() => post(data.enabled ? "disable" : "enable")}
            />
            Habilitar canal
          </label>
        </div>
        {!data.hasCoords ? (
          <p className="text-[13px] text-status-warn-fg">
            Define latitud y longitud en la ficha antes de habilitar el canal. El reporte exige GPS contra el geofence.
          </p>
        ) : null}
        {data.publicUrl ? (
          <p className="break-all font-mono text-[12px] text-ds-text-2">{data.publicUrl}</p>
        ) : null}
        {error ? <p className="text-[13px] text-status-danger-fg">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-ds-border-default px-4 text-[13px] disabled:opacity-50"
            disabled={!data.enabled || busy}
            onClick={() => post("rotate")}
          >
            Rotar token
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
            disabled={!data.enabled}
            onClick={() => download("a4")}
          >
            Afiche A4
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl border border-ds-border-default px-4 text-[13px] disabled:opacity-50"
            disabled={!data.enabled}
            onClick={() => download("sticker")}
          >
            Adhesivo 10×10
          </button>
        </div>
      </Surface>
    </div>
  );
}
