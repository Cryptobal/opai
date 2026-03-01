"use client";

import { useState } from "react";
import { Shield, Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { generateDeviceId, getShortDeviceId } from "@/lib/patrullaje/device-id";

interface Props {
  installationName: string;
  installationId: string;
  onLogin: (data: {
    guardiaId: string;
    guardiaNombre: string;
    sessionId: string;
    rondas: any[];
    deviceId: string;
  }) => void;
}

function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, "");
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

export function LoginScreen({ installationName, installationId, onLogin }: Props) {
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceId = typeof window !== "undefined" ? generateDeviceId() : "";

  const handleSubmit = async () => {
    if (!rut.trim() || !pin.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/patrol/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rut: rut.replace(/\./g, ""),
          pin,
          installationId,
          deviceId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Error al autenticar");
        return;
      }

      onLogin({
        guardiaId: json.data.guardia.id,
        guardiaNombre: json.data.guardia.nombre,
        sessionId: json.data.session.id,
        rondas: json.data.rondas,
        deviceId,
      });
    } catch {
      setError("Error de conexión. Verifica tu internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0f] px-6 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <Shield className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Patrullaje</h1>
            <p className="text-sm text-white/50 mt-1">{installationName}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-white/40 mb-1 block">RUT</label>
            <Input
              className="h-14 bg-white/5 border-white/10 text-white text-lg placeholder:text-white/20 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              placeholder="12.345.678-9"
              inputMode="numeric"
              value={rut}
              onChange={(e) => setRut(formatRut(e.target.value))}
              maxLength={12}
            />
          </div>
          <div>
            <label className="text-[11px] text-white/40 mb-1 block">PIN</label>
            <Input
              className="h-14 bg-white/5 border-white/10 text-white text-2xl tracking-[0.3em] text-center placeholder:text-white/20 placeholder:text-base placeholder:tracking-normal focus:border-emerald-500/50 focus:ring-emerald-500/20"
              type="password"
              placeholder="PIN"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 6))}
              maxLength={6}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !rut.trim() || !pin.trim()}
          className="h-14 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-base font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Ingresar"}
        </button>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        <p className="text-center text-[10px] text-white/20">
          Dispositivo: {deviceId ? getShortDeviceId(deviceId) : "---"}
        </p>
      </div>
    </div>
  );
}
