// @ds-allow-legacy
// PanicAlertBanner intencionalmente usa rojos hex (red-900, red-800, red-200)
// porque es la alarma operativa de máxima urgencia. Migrar a status-danger-soft
// reduciría el efecto visual de "alarma roja" y el banner perdería su función.
"use client";

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, MapPin, Check, Volume2, VolumeX } from "lucide-react";

export interface PanicAlertData {
  alertaId: string;
  incidenteId: string;
  guardiaId: string;
  guardiaNombre: string;
  installationId: string;
  installationNombre: string;
  lat: number | null;
  lng: number | null;
  timestamp: string;
}

interface PanicAlertBannerProps {
  alerts: PanicAlertData[];
  onAcknowledge: (alertaId: string) => void;
}

function playWebAudioAlarm(audioCtx: AudioContext) {
  function beep(freq: number, start: number, dur: number) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.3;
    osc.start(start);
    osc.stop(start + dur);
  }
  for (let i = 0; i < 8; i++) {
    beep(800, audioCtx.currentTime + i * 0.5, 0.25);
    beep(600, audioCtx.currentTime + i * 0.5 + 0.25, 0.25);
  }
}

export function PanicAlertBanner({ alerts, onAcknowledge }: PanicAlertBannerProps) {
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const alarmRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const activeAlerts = alerts.filter((a) => !acknowledgedIds.has(a.alertaId));

  // Sound alarm for active alerts
  useEffect(() => {
    if (activeAlerts.length === 0 || muted) {
      if (alarmRef.current) {
        clearInterval(alarmRef.current);
        alarmRef.current = null;
      }
      return;
    }

    // Create audio context on first alert
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Play immediately
    playWebAudioAlarm(audioCtxRef.current);

    // Repeat every 10 seconds
    alarmRef.current = setInterval(() => {
      if (audioCtxRef.current) {
        playWebAudioAlarm(audioCtxRef.current);
      }
    }, 10000);

    return () => {
      if (alarmRef.current) {
        clearInterval(alarmRef.current);
        alarmRef.current = null;
      }
    };
  }, [activeAlerts.length, muted]);

  const handleAcknowledge = async (alertaId: string) => {
    try {
      const res = await fetch(`/api/ops/rondas/alertas/${alertaId}/acknowledge`, {
        method: "PUT",
      });
      if (res.ok) {
        setAcknowledgedIds((prev) => new Set([...prev, alertaId]));
        onAcknowledge(alertaId);
      }
    } catch {
      // Ignore errors — user can retry
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] space-y-0">
      {/* Active alerts */}
      {activeAlerts.map((alert) => (
        <div
          key={alert.alertaId}
          className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-status-danger-border bg-red-900 px-4 py-3 shadow-2xl animate-pulse"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-status-danger-fg" />
            <div>
              <p className="text-sm font-bold text-white">ALERTA DE PANICO</p>
              <p className="text-sm text-red-200">
                {alert.guardiaNombre} &mdash; {alert.installationNombre} &mdash;{" "}
                {new Date(alert.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alert.lat && alert.lng && (
              <a
                href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-red-800/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-800"
              >
                <MapPin className="h-3.5 w-3.5" /> Ver mapa
              </a>
            )}
            <button
              onClick={() => setMuted((m) => !m)}
              className="rounded-lg bg-red-800/60 p-1.5 text-red-200 hover:bg-red-800"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              onClick={() => handleAcknowledge(alert.alertaId)}
              className="flex items-center gap-1 rounded-lg bg-status-danger px-4 py-1.5 text-sm font-bold text-white shadow hover:bg-status-danger"
            >
              <Check className="h-4 w-4" /> ATENDER
            </button>
          </div>
        </div>
      ))}

      {/* Acknowledged alerts — thin bar that fades after 30s */}
      {alerts
        .filter((a) => acknowledgedIds.has(a.alertaId))
        .map((alert) => (
          <AcknowledgedBar key={`ack-${alert.alertaId}`} alert={alert} />
        ))}
    </div>
  );
}

function AcknowledgedBar({ alert }: { alert: PanicAlertData }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 30000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-red-950/80 px-4 py-1.5 text-xs text-status-danger-fg">
      <Check className="h-3.5 w-3.5" />
      Panico atendido &mdash; {alert.installationNombre} &mdash;{" "}
      {new Date(alert.timestamp).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
    </div>
  );
}
