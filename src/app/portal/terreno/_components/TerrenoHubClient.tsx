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

        // Tenant branding (fire-and-forget). The endpoint resolves tenant
        // from the device token server-side — no tenantId in the URL.
        try {
          const brandRes = await fetch("/api/tenant/branding", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (brandRes.ok) {
            const brand = (await brandRes.json()) as TenantBrand;
            setTenantBrand(brand);
          }
        } catch {
          /* branding is optional */
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
      <div className="flex items-center justify-center min-h-dvh bg-[#060a13] text-white">
        <div className="text-center">
          {tenantBrand?.brandingLogoWhite ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenantBrand.brandingLogoWhite}
              alt={tenantBrand.commercialName ?? ""}
              className="h-12 mx-auto mb-4 object-contain opacity-90"
            />
          ) : (
            <div
              className="text-2xl font-bold mb-4"
              style={{ letterSpacing: "-0.02em" }}
            >
              Opai Terreno
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <div
              className="w-4 h-4 rounded-full border-2 border-status-warn-border/30 border-t-status-warn animate-spin"
              aria-hidden
            />
            <span className="text-sm text-gray-400">Cargando...</span>
          </div>
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
      accent: "#f97316",
      glow: "rgba(249,115,22,0.14)",
    },
    {
      id: "rondas",
      name: "Rondas",
      description: "Patrullaje y checkpoints",
      href: "/portal/rondas?from=terreno",
      enabled: config?.portalRondasEnabled ?? true,
      Icon: Shield,
      accent: "#10b981",
      glow: "rgba(16,185,129,0.14)",
    },
    {
      id: "acceso",
      name: "Control de Acceso",
      description: "Ingreso y salida",
      href: "/portal/acceso?from=terreno",
      enabled: config?.portalAccesoEnabled ?? true,
      Icon: DoorOpen,
      accent: "#f59e0b",
      glow: "rgba(245,158,11,0.14)",
    },
  ];

  const enabledPortals = portals.filter((p) => p.enabled);

  // Only one sub-app enabled → go straight to it
  if (enabledPortals.length === 1) {
    router.replace(enabledPortals[0].href);
    return null;
  }

  return (
    <div
      className="flex flex-col min-h-dvh text-white"
      style={{
        background:
          "linear-gradient(180deg, #060a13 0%, #0a0e17 30%, #0d1220 100%)",
        paddingTop: "var(--safe-area-top, 0px)",
        paddingBottom: "var(--safe-area-bottom, 0px)",
      }}
    >
      {/* Amber halo */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-[0]"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 30%, transparent 70%)",
        }}
      />

      <div className="relative z-[1] flex-1 flex flex-col justify-center px-6 py-10 max-w-md mx-auto w-full">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="relative inline-flex mb-3">
            <div
              aria-hidden
              className="absolute inset-0 -m-3 rounded-3xl blur-xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(245,158,11,0.08) 60%, transparent 80%)",
              }}
            />
            {tenantBrand?.brandingLogoWhite ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenantBrand.brandingLogoWhite}
                alt={tenantBrand.commercialName ?? "Tenant"}
                className="relative h-14 object-contain"
              />
            ) : (
              <div
                className="relative text-3xl font-bold"
                style={{ letterSpacing: "-0.02em" }}
              >
                Opai Terreno
              </div>
            )}
          </div>
          {tenantBrand?.commercialName ? (
            <p className="text-sm text-[#9ca3af] mt-2">
              {tenantBrand.commercialName}
            </p>
          ) : null}
          {config ? (
            <div
              className="inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <div
                className="w-[6px] h-[6px] rounded-full bg-status-warn"
                style={{ boxShadow: "0 0 8px rgba(245,158,11,0.7)" }}
                aria-hidden
              />
              <span className="text-[11px] font-medium text-status-warn-fg">
                {config.installationName}
              </span>
            </div>
          ) : null}
          <h1
            className="text-xl font-semibold mt-5 mb-1"
            style={{ letterSpacing: "-0.01em" }}
          >
            Modo de operación
          </h1>
          <p className="text-[13px] text-[#6b7280]">
            Elige qué vas a hacer en este dispositivo
          </p>
        </div>

        {/* Sub-app cards */}
        <div className="flex flex-col gap-3">
          {enabledPortals.map((portal) => {
            const Icon = portal.Icon;
            return (
              <button
                key={portal.id}
                type="button"
                onClick={() => router.push(portal.href)}
                className="relative w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.98] hover:-translate-y-0.5"
                style={{
                  padding: "18px 20px",
                  background: `linear-gradient(180deg, rgba(255,255,255,0.035), ${portal.glow})`,
                  border: `1px solid ${portal.accent}30`,
                  boxShadow: `0 10px 32px ${portal.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  backdropFilter: "blur(18px) saturate(1.15)",
                  WebkitBackdropFilter: "blur(18px) saturate(1.15)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-[60%] h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${portal.accent}, transparent)`,
                  }}
                />
                <div className="flex items-center gap-4">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "13px",
                      background: `${portal.accent}16`,
                      border: `1px solid ${portal.accent}35`,
                      color: portal.accent,
                    }}
                  >
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[17px] font-semibold text-white"
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {portal.name}
                    </div>
                    <div className="text-[13px] text-[#9ca3af] mt-0.5">
                      {portal.description}
                    </div>
                  </div>
                  <div style={{ color: portal.accent }} aria-hidden>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-[1] text-center text-[11px] text-[#4b5563] pb-4">
        Opai Terreno
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
            className="rounded-xl px-4 py-3 mb-4 text-sm text-status-danger-fg"
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
