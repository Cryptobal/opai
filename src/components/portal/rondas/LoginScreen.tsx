"use client";

import { useState, useCallback } from "react";
import { formatRut, isValidRut } from "@/lib/guard-portal";
import type { RondasSession } from "./RondasPortalClient";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthTextInput } from "@/components/auth/AuthTextInput";
import { AuthPinInput } from "@/components/auth/AuthPinInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { IdCardIcon } from "@/components/auth/icons";

interface Props {
  onLogin: (session: RondasSession) => void;
}

const ACCENT = "#10b981";

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
    <AuthShell
      portalId="rondas"
      accent={ACCENT}
      accentRgb="16, 185, 129"
      portalName="Portal Rondas"
      portalSubtitle="Checkpoints y registro"
    >
      <AuthFormHeader title="Ingresa tu PIN" subtitle="Ingresa para iniciar tu turno de rondas" />

      <PWAInstallBanner
        appName="OPAI Rondas"
        appDescription="Rondas y marcaciones sin complicaciones"
        iconSrc="/icons/icon-192x192.png"
        variant="inline"
        dismissKey="rondas"
      />

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <AuthTextInput
          label="RUT"
          accent={ACCENT}
          icon={<IdCardIcon />}
          value={rut}
          onChange={(e) => setRut(formatRut(e.target.value))}
          placeholder="12.345.678-9"
          maxLength={12}
          autoComplete="off"
          inputMode="numeric"
        />

        <label
          className="block text-xs font-medium text-[#9ca3af] mb-[7px]"
          style={{ letterSpacing: "0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Tu PIN (4 d&iacute;gitos)
        </label>
        <AuthPinInput length={4} accent={ACCENT} value={pin} onChange={setPin} />

        {error && (
          <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-xs text-red-400 text-center">{error}</p>
          </div>
        )}

        <AuthButton
          accent={ACCENT}
          label="Iniciar Turno"
          type="submit"
          disabled={loading || !rut || !pin}
          loading={loading}
        />
      </form>
    </AuthShell>
  );
}
