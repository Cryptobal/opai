"use client";

import { useState } from "react";
import { X, FileCheck2, Loader2 } from "lucide-react";
import { portalFetch } from "@/lib/portal-cliente-fetch";
import { usePortalSession } from "@/contexts/portal-cliente-session-context";

interface Props {
  protocolId: string;
  protocolTitle: string;
  protocolVersion: string;
  onClose: () => void;
  onSigned: (acceptedAt: string) => void;
}

export function ProtocolSignModal({
  protocolId,
  protocolTitle,
  protocolVersion,
  onClose,
  onSigned,
}: Props) {
  const { session } = usePortalSession();
  const [firmanteNombre, setFirmanteNombre] = useState(
    session ? `${session.firstName} ${session.lastName}`.trim() : "",
  );
  const [firmanteRut, setFirmanteRut] = useState("");
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!checked || !firmanteNombre.trim()) return;
    setSubmitting(true);
    try {
      const res = await portalFetch(
        `/api/portal/cliente/protocolos/${protocolId}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firmanteNombre: firmanteNombre.trim(),
            firmanteRut: firmanteRut.trim() || undefined,
          }),
        },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al firmar");
      onSigned(json.data.acceptedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Firmar protocolo</h3>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">
              {protocolTitle} · {protocolVersion}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1 block">
            Nombre completo <span className="text-status-danger-fg">*</span>
          </label>
          <input
            type="text"
            value={firmanteNombre}
            onChange={(e) => setFirmanteNombre(e.target.value)}
            className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:border-status-info-border"
          />
        </div>

        <div>
          <label className="text-xs text-zinc-400 mb-1 block">RUT (opcional)</label>
          <input
            type="text"
            value={firmanteRut}
            onChange={(e) => setFirmanteRut(e.target.value)}
            placeholder="12.345.678-9"
            className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:border-status-info-border"
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-xs text-zinc-300">
            Confirmo que he leído y acepto este protocolo en representación de{" "}
            <strong>{session?.accountName}</strong>.
          </span>
        </label>

        {error && <p className="text-xs text-status-danger-fg">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg border border-zinc-700 text-zinc-300 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!checked || !firmanteNombre.trim() || submitting}
            className="flex-1 h-10 rounded-lg bg-status-info hover:bg-status-info disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileCheck2 className="w-4 h-4" />
            )}
            Firmar
          </button>
        </div>
      </div>
    </div>
  );
}
