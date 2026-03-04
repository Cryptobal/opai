"use client";

import { useState, useCallback } from "react";
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
      sessionStorage.setItem("rondas_portal_session", JSON.stringify(session));
      onLogin(session);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [rut, pin, onLogin]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Rondas</h1>
          <p className="mt-2 text-lg text-gray-400">Ingrese su RUT y PIN</p>
        </div>

        <PWAInstallBanner
          appName="OPAI Rondas"
          appDescription="Rondas y marcaciones sin complicaciones"
          iconSrc="/iconos_azul/icon-192x192.png"
          variant="inline"
          dismissKey="rondas"
        />

        {error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-5">
          <div>
            <label htmlFor="rondas-rut" className="mb-2 block text-base text-gray-300">RUT</label>
            <input
              id="rondas-rut"
              type="text"
              inputMode="numeric"
              value={rut}
              onChange={(e) => setRut(formatRut(e.target.value))}
              placeholder="12.345.678-9"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-4 text-xl text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="rondas-pin" className="mb-2 block text-base text-gray-300">PIN</label>
            <input
              id="rondas-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="****"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-4 text-xl tracking-[0.3em] text-white placeholder:text-gray-600 focus:border-teal-500 focus:outline-none"
              autoComplete="off"
            />
            {/* PIN dots visualization */}
            <div className="flex justify-center gap-3 my-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < pin.length
                      ? "bg-teal-400 border-teal-400 scale-110"
                      : "bg-transparent border-zinc-600"
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 py-4 text-xl font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
