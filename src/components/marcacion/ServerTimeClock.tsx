"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface LastCheck {
  checkedAt: string;
  referenceSource: string;
  driftMs: number | null;
  status: string;
}

interface HoraServidorResponse {
  success: boolean;
  serverTimeUtc: string;
  timezone: string;
  lastCheck: LastCheck | null;
}

function formatChileClock(date: Date): string {
  return date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  });
}

/**
 * Reloj de evidencia: parte de la hora del servidor y avanza localmente cada segundo.
 */
export function ServerTimeClock({ compact = false }: { compact?: boolean }) {
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [timezone, setTimezone] = useState("America/Santiago");
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch("/api/public/hora-servidor", { cache: "no-store" });
        const json = (await res.json()) as HoraServidorResponse;
        if (!res.ok || !json.success || !json.serverTimeUtc) {
          if (!cancelled) setError(true);
          return;
        }
        const serverMs = Date.parse(json.serverTimeUtc);
        if (!cancelled) {
          setOffsetMs(serverMs - Date.now());
          setTimezone(json.timezone || "America/Santiago");
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void sync();
    const refresh = setInterval(() => void sync(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const display =
    offsetMs == null ? now : new Date(now.getTime() + offsetMs);
  const clock = formatChileClock(display);

  if (compact) {
    return (
      <p className="text-center font-mono text-[12px] text-ds-text-3">
        {error
          ? "Hora del dispositivo (sin sincronizar)"
          : offsetMs == null
            ? "Sincronizando hora del servidor…"
            : `Hora del servidor: ${clock} (${timezone})`}
      </p>
    );
  }

  return (
    <div className="text-center py-6 bg-slate-50 rounded-xl mb-4">
      <p className="text-4xl font-bold text-slate-900 tabular-nums">{clock}</p>
      <p className="mt-2 flex items-center justify-center gap-1 text-[12px] text-slate-500">
        <Clock className="h-3.5 w-3.5" />
        {error
          ? "Hora local (no se pudo leer el servidor)"
          : offsetMs == null
            ? "Sincronizando hora del servidor…"
            : `Hora del servidor (${timezone})`}
      </p>
    </div>
  );
}
