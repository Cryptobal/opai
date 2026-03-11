"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { formatRut, isValidRut } from "@/lib/guard-portal";
import type { RondasSession } from "./RondasPortalClient";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";

interface Props {
  onLogin: (session: RondasSession) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async () => {
    if (!isValidRut(rut)) {
      setError("RUT inválido");
      return;
    }
    if (pin.length < 4) {
      setError("PIN debe tener al menos 4 dígitos");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/rondas/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut, pin }),
      });
      const json = await res.json();

      if (!json.success) {
        setError(json.error || "Error al autenticar");
        return;
      }

      const { guardiaId, tenantId, nombre, currentInstallationId, installations: instList } = json.data;

      if (!instList || instList.length === 0) {
        setError("No tienes instalación asignada. Contacta a tu supervisor.");
        return;
      }

      // 1 guard = 1 installation: pick the current one or fall back to the first
      const inst =
        (currentInstallationId && instList.find((i: { id: string }) => i.id === currentInstallationId)) ||
        instList[0];

      const session: RondasSession = {
        guardiaId,
        tenantId,
        installationId: inst.id,
        nombre,
        installationName: inst.name,
        authenticatedAt: new Date().toISOString(),
      };
      localStorage.setItem("rondas_portal_session", JSON.stringify({ session, storedAt: Date.now() }));
      onLogin(session);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [rut, pin, onLogin]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo-horizontal-white.png" alt="OPAI" className="h-8 object-contain mx-auto" />
          </div>
          <h1 className="text-lg font-semibold">Portal de Rondas</h1>
          <p className="text-sm text-zinc-400 mt-1">RUT + tu PIN de acceso</p>
        </div>

        <PWAInstallBanner
          appName="OPAI Rondas"
          appDescription="Rondas y marcaciones sin complicaciones"
          iconSrc="/icons/icon-192x192.png"
          variant="inline"
          dismissKey="rondas"
        />

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-3">
          <div>
            <label htmlFor="rondas-rut" className="text-xs text-zinc-400 mb-1 block">RUT</label>
            <input
              id="rondas-rut"
              type="text"
              inputMode="numeric"
              value={rut}
              onChange={(e) => setRut(formatRut(e.target.value))}
              placeholder="12.345.678-9"
              maxLength={12}
              className="w-full h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              autoComplete="off"
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("rondas-pin")?.focus()}
            />
          </div>

          <div>
            <label htmlFor="rondas-pin" className="text-xs text-zinc-400 mb-1 block">Tu PIN (4 dígitos)</label>
            <input
              id="rondas-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              maxLength={4}
              className="w-full h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              autoComplete="off"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !rut || !pin}
            className="w-full h-11 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Ingresar
          </button>
        </form>

        <p className="text-[10px] text-zinc-600 text-center">
          Powered by{" "}
          <a href="https://lx3.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400 transition-colors">LX3.ai</a>
        </p>
      </div>
    </div>
  );
}
