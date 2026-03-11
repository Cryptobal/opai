"use client";

import { useState } from "react";
import { AlertTriangle, Phone, MapPin, Loader2, MessageSquare } from "lucide-react";
import { whatsappUrl } from "@/app/(app)/hub/_lib/hub-utils";

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
  onAcknowledge: (alertaId: string) => Promise<void>;
}

export function PanicFullscreenModal({ alerts, onAcknowledge }: PanicFullscreenModalProps) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const handleAcknowledge = async (alertaId: string) => {
    setLoadingIds((prev) => new Set([...prev, alertaId]));
    try {
      await onAcknowledge(alertaId);
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
                <InfoRow label="Tel. instalacion" value={alert.installationTelefono} />
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

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handleAcknowledge(alert.alertaId)}
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
