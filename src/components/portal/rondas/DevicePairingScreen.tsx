"use client";

import { FormEvent, useState, useCallback } from "react";
import { collectDeviceMetadata } from "@/lib/device-metadata";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthPairingInput } from "@/components/auth/AuthPairingInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthInfoBox } from "@/components/auth/AuthInfoBox";

interface Props {
  onPaired: (data: {
    deviceToken: string;
    installationId: string;
    installationName: string;
  }) => void;
  onLegacyLogin?: () => void;
}

const ACCENT = "#10b981";

export function DevicePairingScreen({ onPaired, onLegacyLogin }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;

    setError("");
    setLoading(true);

    // Format code: XX-XX-XX (matches portal display)
    const raw = code.replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const fullCode = `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;

    try {
      let metadata = {};
      try {
        metadata = await collectDeviceMetadata();
      } catch {
        // Metadata collection failed (restricted browser) — proceed without it
      }

      const res = await fetch("/api/devices/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fullCode, metadata }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setError(json.error || "Código inválido o expirado");
        return;
      }

      const { deviceToken, installationId, installationName } = json.data;
      safeStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
      onPaired({ deviceToken, installationId, installationName });
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      portalId="rondas"
      accent={ACCENT}
      accentRgb="16, 185, 129"
      portalName="Portal Rondas"
      portalSubtitle="Checkpoints y registro"
    >
      <AuthFormHeader title="Emparejar Dispositivo" subtitle="Ingresa el código de emparejamiento" />

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm text-status-danger-fg"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            {error}
          </div>
        )}

        <AuthPairingInput accent={ACCENT} value={code} onChange={setCode} />

        <AuthButton
          accent={ACCENT}
          label="Emparejar Dispositivo"
          type="submit"
          disabled={code.length < 6 || loading}
          loading={loading}
        />
      </form>

      <AuthInfoBox
        accent={ACCENT}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        }
      >
        Este dispositivo quedará vinculado al recorrido de rondas asignado.
      </AuthInfoBox>

      {onLegacyLogin && (
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={onLegacyLogin}
            className="text-xs text-[#6b7280] hover:text-[#9ca3af] transition-colors"
            style={{ textDecoration: "underline", textUnderlineOffset: "2px" }}
          >
            &iquest;Problemas? Ingresar con RUT + PIN
          </button>
        </div>
      )}
    </AuthShell>
  );
}
