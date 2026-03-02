"use client";

import { useState, useCallback } from "react";
import { formatRut, isValidRut } from "@/lib/guard-portal";
import type { RondasSession } from "./RondasPortalClient";

interface Props {
  onLogin: (session: RondasSession) => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [installations, setInstallations] = useState<{ id: string; name: string }[]>([]);
  const [step, setStep] = useState<"credentials" | "select-installation">("credentials");
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

      if (instList.length === 0) {
        setError("No tiene instalaciones asignadas");
        return;
      }

      if (instList.length === 1) {
        const inst = instList[0];
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
        return;
      }

      // Multiple installations — save auth data and show selector
      setInstallations(instList);
      sessionStorage.setItem("rondas_portal_auth_temp", JSON.stringify({ guardiaId, tenantId, nombre }));
      if (currentInstallationId) setInstallationId(currentInstallationId);
      setStep("select-installation");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [rut, pin, onLogin]);

  const handleSelectInstallation = useCallback(() => {
    // This requires auth data from the previous step — stored temporarily
    const authDataStr = sessionStorage.getItem("rondas_portal_auth_temp");
    if (!authDataStr || !installationId) return;
    let authData: { guardiaId: string; tenantId: string; nombre: string };
    try {
      authData = JSON.parse(authDataStr);
    } catch {
      setError("Error al recuperar datos de sesión");
      setStep("credentials");
      return;
    }
    const inst = installations.find(i => i.id === installationId);
    if (!inst) return;

    const session: RondasSession = {
      guardiaId: authData.guardiaId,
      tenantId: authData.tenantId,
      installationId: inst.id,
      nombre: authData.nombre,
      installationName: inst.name,
      authenticatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem("rondas_portal_session", JSON.stringify(session));
    onLogin(session);
  }, [installationId, installations, onLogin]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Rondas</h1>
          <p className="mt-2 text-lg text-gray-400">Ingrese su RUT y PIN</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/20 px-4 py-3 text-center text-base text-red-300">
            {error}
          </div>
        )}

        {step === "credentials" ? (
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
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal-600 py-4 text-xl font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <label className="mb-2 block text-base text-gray-300">Seleccione instalación</label>
            {installations.map(inst => (
              <button
                key={inst.id}
                onClick={() => { setInstallationId(inst.id); }}
                className={`w-full rounded-xl border px-4 py-4 text-left text-lg transition-colors ${
                  installationId === inst.id
                    ? "border-teal-500 bg-teal-900/30 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-300"
                }`}
              >
                {inst.name}
              </button>
            ))}
            <button
              onClick={handleSelectInstallation}
              disabled={!installationId}
              className="w-full rounded-xl bg-teal-600 py-4 text-xl font-semibold text-white transition-colors hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50"
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
