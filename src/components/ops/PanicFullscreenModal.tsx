"use client";

import { useState } from "react";
import { AlertTriangle, Phone, MapPin, Loader2, MessageSquare, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/app/(app)/hub/_lib/hub-utils";
import { useRouter } from "next/navigation";

export interface PanicAlertData {
  alertaId: string;
  incidenteId: string;
  guardiaId: string;
  guardiaNombre: string;
  guardiaTelefono?: string | null;
  installationId: string;
  installationNombre: string;
  installationTelefono?: string | null;
  lat: number | null;
  lng: number | null;
  timestamp: string;
}

interface PanicFullscreenModalProps {
  alerts: PanicAlertData[];
  onResolve: (alertaId: string, resolutionNotes: string) => Promise<void>;
}

export function PanicFullscreenModal({ alerts, onResolve }: PanicFullscreenModalProps) {
  const router = useRouter();
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [errorsMap, setErrorsMap] = useState<Record<string, string>>({});

  const handleResolve = async (alertaId: string) => {
    const notes = (notesMap[alertaId] ?? "").trim();
    if (notes.length < 10) {
      setErrorsMap((prev) => ({ ...prev, [alertaId]: "Debes escribir qué pasó (mínimo 10 caracteres)" }));
      return;
    }
    setErrorsMap((prev) => { const n = { ...prev }; delete n[alertaId]; return n; });
    setLoadingIds((prev) => new Set([...prev, alertaId]));
    try {
      await onResolve(alertaId, notes);
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(alertaId);
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-900/80 backdrop-blur-sm">
      {/* Pulsing red border effect */}
      <div className="absolute inset-0 animate-pulse pointer-events-none border-[6px] border-red-500/50" />

      <div className="relative mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border-2 border-red-500 bg-zinc-900 p-6 shadow-2xl shadow-red-900/50 space-y-6">
        {alerts.map((alert, idx) => (
          <div key={alert.alertaId} className="space-y-4">
            {idx > 0 && <hr className="border-red-800" />}

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-900/60 ring-2 ring-red-500/40">
                <AlertTriangle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-red-400">ALERTA DE PANICO</h2>
                <p className="text-xs text-red-300">
                  {new Date(alert.timestamp).toLocaleTimeString("es-CL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-2 rounded-lg bg-zinc-800/50 p-4">
              <InfoRow label="Guardia" value={alert.guardiaNombre} />
              <InfoRow label="Instalacion" value={alert.installationNombre} />
              {alert.guardiaTelefono && (
                <div className="flex items-center justify-between">
                  <InfoRow label="Tel. guardia" value={alert.guardiaTelefono} />
                  <a
                    href={`tel:${alert.guardiaTelefono}`}
                    className="flex items-center gap-1 rounded-md bg-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-600"
                  >
                    <Phone className="h-3 w-3" /> Llamar
                  </a>
                </div>
              )}
              {alert.installationTelefono && (
                <div className="flex items-center justify-between">
                  <InfoRow label="Tel. instalacion" value={alert.installationTelefono} />
                  <a
                    href={`tel:${alert.installationTelefono}`}
                    className="flex items-center gap-1 rounded-md bg-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-600"
                  >
                    <Phone className="h-3 w-3" /> Llamar
                  </a>
                </div>
              )}
            </div>

            {/* Map link */}
            {alert.lat != null && alert.lng != null && (
              <a
                href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300"
              >
                <MapPin className="h-4 w-4" />
                Ver ubicacion en mapa
              </a>
            )}

            {/* Resolution notes — required before closing */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-red-300">
                ¿Qué pasó con esta alerta? (obligatorio)
              </label>
              <textarea
                value={notesMap[alert.alertaId] ?? ""}
                onChange={(e) => {
                  setNotesMap((prev) => ({ ...prev, [alert.alertaId]: e.target.value }));
                  if (e.target.value.trim().length >= 10) {
                    setErrorsMap((prev) => { const n = { ...prev }; delete n[alert.alertaId]; return n; });
                  }
                }}
                placeholder="Describe qué ocurrió y cómo se atendió (mín. 10 caracteres)..."
                rows={3}
                className="w-full rounded-lg border border-red-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              {errorsMap[alert.alertaId] && (
                <p className="text-xs font-medium text-red-400">{errorsMap[alert.alertaId]}</p>
              )}
              <p className="text-[11px] text-zinc-500">
                {(notesMap[alert.alertaId] ?? "").trim().length}/10 caracteres mínimo
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <button
                  onClick={() => handleResolve(alert.alertaId)}
                  disabled={loadingIds.has(alert.alertaId)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-red-500 disabled:opacity-60"
                >
                  {loadingIds.has(alert.alertaId) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "✓ ATENDER ALERTA"
                  )}
                </button>
                {alert.guardiaTelefono && (
                  <a
                    href={`tel:${alert.guardiaTelefono}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-700 py-3 text-sm font-bold text-white hover:bg-zinc-600"
                  >
                    <Phone className="h-4 w-4" />
                    LLAMAR
                  </a>
                )}
                {alert.installationTelefono && (
                  <a
                    href={`tel:${alert.installationTelefono}`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-700 py-3 text-sm font-bold text-white hover:bg-zinc-600"
                  >
                    <Phone className="h-4 w-4" />
                    LLAMAR INST.
                  </a>
                )}
                {alert.guardiaTelefono && (
                  <a
                    href={`${whatsappUrl(alert.guardiaTelefono)}?text=${encodeURIComponent("Alerta de panico recibida. Estamos en contacto.")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-700 py-3 text-sm font-bold text-white hover:bg-green-600"
                  >
                    <MessageSquare className="h-4 w-4" />
                    WHATSAPP
                  </a>
                )}
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/chat/channels?type=INSTALLATION");
                    if (res.ok) {
                      const json = await res.json();
                      const ch = (json.data as any[])?.find((c: any) => c.installationId === alert.installationId);
                      if (ch) {
                        router.push(`/chat?channel=${ch.id}`);
                        return;
                      }
                    }
                    router.push("/chat");
                  } catch {
                    router.push("/chat");
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 py-3 text-sm font-bold text-white hover:bg-teal-600"
              >
                <MessageCircle className="h-4 w-4" />
                IR AL CHAT DE LA INSTALACIÓN
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-white">
      <span className="text-zinc-400">{label}:</span> {value}
    </p>
  );
}
