"use client";

import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthPairingInput } from "@/components/auth/AuthPairingInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthInfoBox } from "@/components/auth/AuthInfoBox";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";

interface MarcacionPairingScreenProps {
  onPaired: (data: {
    deviceToken: string;
    installationId: string;
    installationName: string;
    installationAddress: string;
  }) => void;
}

function safe(fn: () => string, fallback = "unknown"): string {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

function generateFingerprint(): string {
  return [
    safe(() => navigator.userAgent),
    safe(() => `${screen.width}x${screen.height}`, "0x0"),
    safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    safe(() => navigator.language),
  ].join("|");
}

const ACCENT = "#10b981"; // emerald-500

export function MarcacionPairingScreen({ onPaired }: MarcacionPairingScreenProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;

    setError(null);
    setLoading(true);

    // Format code: XX-XX-XX (matches portal display)
    const raw = code.replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const fullCode = `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;

    try {
      const res = await fetch("/api/devices/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fullCode,
          metadata: {
            userAgent: safe(() => navigator.userAgent),
            screenWidth: safe(() => String(screen.width), "0"),
            screenHeight: safe(() => String(screen.height), "0"),
            screenResolution: safe(() => `${screen.width}x${screen.height}`, "0x0"),
            timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
            language: safe(() => navigator.language),
            deviceFingerprint: generateFingerprint(),
          },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error ?? "Código inválido o expirado. Verifica e intenta de nuevo."
        );
      }

      const result = data?.data ?? data;

      onPaired({
        deviceToken: result.deviceToken,
        installationId: result.installationId,
        installationName: result.installationName,
        installationAddress: result.installationAddress ?? "",
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al vincular. Intenta de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      portalId="marcacion"
      accent={ACCENT}
      accentRgb="16, 185, 129"
      portalName="Marcación"
      portalSubtitle="Control de asistencia"
    >
      <AuthFormHeader title="Emparejar Dispositivo" subtitle="Código de emparejamiento de 6 caracteres" />

      <PWAInstallBanner
        appName="Marcación"
        appDescription="Entrada y salida con Face ID o PIN"
        iconSrc="/icons/icon-192x192.png"
        variant="inline"
        dismissKey="marcacion"
      />

      <form onSubmit={handleSubmit}>
        {error && (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm text-red-400"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            {error}
          </div>
        )}

        <AuthPairingInput accent={ACCENT} value={code} onChange={setCode} />

        <AuthButton
          accent={ACCENT}
          label="Emparejar"
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
        El código fue generado por el administrador. Este dispositivo quedará vinculado para marcación de asistencia.
      </AuthInfoBox>
    </AuthShell>
  );
}
