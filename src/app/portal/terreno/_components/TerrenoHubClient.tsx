"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Shield, DoorOpen } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthPairingInput } from "@/components/auth/AuthPairingInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthInfoBox } from "@/components/auth/AuthInfoBox";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";

interface DeviceConfig {
  installationId: string;
  installationName: string;
  tenantId: string;
  portalMarcacionEnabled: boolean;
  portalRondasEnabled: boolean;
  portalAccesoEnabled: boolean;
}

interface TenantBrand {
  commercialName?: string;
  brandingLogoWhite?: string;
  brandingLogoIcon?: string;
  brandingPrimaryColor?: string;
  brandingAppName?: string;
}

type AppState = "loading" | "pairing" | "ready";

const ACCENT = "#f59e0b"; // amber-500 — Terreno hub color

/* ------------------------------------------------------------------ */
/*  Device fingerprint helpers (mirror of MarcacionPairingScreen)      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  TerrenoHubClient                                                    */
/* ------------------------------------------------------------------ */

export function TerrenoHubClient() {
  const router = useRouter();
  const [state, setState] = useState<AppState>("loading");
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [tenantBrand, setTenantBrand] = useState<TenantBrand | null>(null);

  useEffect(() => {
    async function init() {
      const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
      if (!token) {
        setState("pairing");
        return;
      }

      try {
        const res = await fetch("/api/devices/validate", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          safeStorage.removeItem(DEVICE_TOKEN_KEY);
          setState("pairing");
          return;
        }
        const json = await res.json();
        const data = json.data ?? json;
        const cfg: DeviceConfig = {
          installationId: data.installationId,
          installationName: data.installationName ?? "Instalación",
          tenantId: data.tenantId,
          portalMarcacionEnabled: data.portalMarcacionEnabled !== false,
          portalRondasEnabled: data.portalRondasEnabled !== false,
          portalAccesoEnabled: data.portalAccesoEnabled !== false,
        };
        setConfig(cfg);
        setState("ready");

        // Tenant branding (fire-and-forget)
        if (cfg.tenantId) {
          try {
            const brandRes = await fetch(
              `/api/tenant/branding?tenantId=${encodeURIComponent(cfg.tenantId)}`,
            );
            if (brandRes.ok) {
              const brand = (await brandRes.json()) as TenantBrand;
              setTenantBrand(brand);
            }
          } catch {
            /* branding is optional */
          }
        }
      } catch {
        // Offline — let the user still see the sub-app selector with all
        // three enabled (they can attempt to use cached data inside each).
        setState("ready");
        setConfig(null);
      }
    }
    init();
  }, []);

  /* --------------------------- Loading --------------------------- */
  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#060a13]">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-2">Opai Terreno</div>
          <div className="text-sm text-gray-400">Cargando...</div>
        </div>
      </div>
    );
  }

  /* --------------------------- Pairing --------------------------- */
  if (state === "pairing") {
    return (
      <TerrenoPairingScreen
        onPaired={() => {
          // Reload: the effect will re-read the token and move to "ready"
          window.location.reload();
        }}
      />
    );
  }

  /* ---------------------------- Ready ---------------------------- */
  const portals = [
    {
      id: "marcacion",
      name: "Marcación",
      description: "Asistencia con Face ID",
      href: "/portal/marcacion?from=terreno",
      enabled: config?.portalMarcacionEnabled ?? true,
      Icon: Clock,
      color: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
    },
    {
      id: "rondas",
      name: "Rondas",
      description: "Patrullaje y checkpoints",
      href: "/portal/rondas?from=terreno",
      enabled: config?.portalRondasEnabled ?? true,
      Icon: Shield,
      color: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
    },
    {
      id: "acceso",
      name: "Control de Acceso",
      description: "Ingreso y salida",
      href: "/portal/acceso?from=terreno",
      enabled: config?.portalAccesoEnabled ?? true,
      Icon: DoorOpen,
      color: "from-green-500/20 to-green-600/10 border-green-500/30",
    },
  ];

  const enabledPortals = portals.filter((p) => p.enabled);

  // Only one sub-app enabled → go straight to it
  if (enabledPortals.length === 1) {
    router.replace(enabledPortals[0].href);
    return null;
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[#060a13] text-white p-6">
      {/* Header */}
      <div className="text-center mt-8 mb-4">
        {tenantBrand?.brandingLogoWhite ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenantBrand.brandingLogoWhite}
            alt={tenantBrand.commercialName ?? "Tenant"}
            className="h-10 mx-auto mb-2 object-contain"
          />
        ) : null}
        <h1 className="text-2xl font-bold">Opai Terreno</h1>
        {tenantBrand?.commercialName ? (
          <p className="text-sm text-gray-400 mt-1">
            {tenantBrand.commercialName}
          </p>
        ) : null}
        {config ? (
          <p className="text-xs text-gray-500 mt-0.5">
            {config.installationName}
          </p>
        ) : null}
      </div>

      {/* Sub-app cards */}
      <div className="flex-1 flex flex-col justify-center gap-4 max-w-sm mx-auto w-full">
        {enabledPortals.map((portal) => {
          const Icon = portal.Icon;
          return (
            <button
              key={portal.id}
              onClick={() => router.push(portal.href)}
              className={`
                p-6 rounded-2xl border bg-gradient-to-br ${portal.color}
                text-left transition-transform active:scale-[0.98]
              `}
            >
              <Icon className="w-8 h-8 mb-3 opacity-80" />
              <div className="text-lg font-semibold">{portal.name}</div>
              <div className="text-sm text-gray-400 mt-1">
                {portal.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 pb-4">
        Opai Terreno v1.0
      </div>
    </div>
  );
}

/* ================================================================== */
/*  TerrenoPairingScreen — inline pairing UI                            */
/* ================================================================== */

function TerrenoPairingScreen({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;

    setError(null);
    setLoading(true);

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
            screenResolution: safe(
              () => `${screen.width}x${screen.height}`,
              "0x0",
            ),
            timezone: safe(() =>
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            ),
            language: safe(() => navigator.language),
            deviceFingerprint: generateFingerprint(),
          },
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error ?? "Código inválido o expirado. Verifica e intenta de nuevo.",
        );
      }

      const result = data?.data ?? data;

      // Persist the device token. Same key the three sub-apps already read.
      safeStorage.setItem(DEVICE_TOKEN_KEY, result.deviceToken);

      onPaired();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al vincular. Intenta de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      portalId="terreno"
      accent={ACCENT}
      accentRgb="245, 158, 11"
      portalName="Opai Terreno"
      portalSubtitle="Dispositivo en instalación"
      showBackLink={false}
    >
      <AuthFormHeader
        title="Emparejar dispositivo"
        subtitle="Código de 6 caracteres generado por tu supervisor"
      />

      <form onSubmit={handleSubmit}>
        {error ? (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm text-red-400"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {error}
          </div>
        ) : null}

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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={ACCENT}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        }
      >
        Una vez emparejado, este dispositivo podrá usar Marcación, Rondas y
        Control de Acceso sin volver a pedir el código.
      </AuthInfoBox>
    </AuthShell>
  );
}
