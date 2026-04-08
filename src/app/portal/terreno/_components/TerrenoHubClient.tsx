"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Shield, DoorOpen } from "lucide-react";
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

type AppState = "loading" | "no-device" | "ready";

export function TerrenoHubClient() {
  const router = useRouter();
  const [state, setState] = useState<AppState>("loading");
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [tenantBrand, setTenantBrand] = useState<TenantBrand | null>(null);

  useEffect(() => {
    async function init() {
      const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
      if (!token) {
        setState("no-device");
        return;
      }

      try {
        const res = await fetch("/api/devices/validate", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          safeStorage.removeItem(DEVICE_TOKEN_KEY);
          setState("no-device");
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

        // Fetch tenant branding (fire-and-forget)
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
        // Offline — show all options as a fallback
        setState("ready");
        setConfig(null);
      }
    }
    init();
  }, []);

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

  // Portals list: enabled flags apply only when we have a device config.
  // In no-device / offline mode we show all three so the user can pick
  // which pairing flow to start.
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

  // When a device is fully paired AND only one portal is enabled, go straight
  // there. Skipped in no-device mode so the user always sees the three options.
  if (state === "ready" && enabledPortals.length === 1) {
    router.replace(enabledPortals[0].href);
    return null;
  }

  const isNoDevice = state === "no-device";

  return (
    <div className="flex flex-col min-h-dvh bg-[#060a13] text-white p-6">
      {/* Header — tenant branding when available */}
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
        {isNoDevice ? (
          <p className="text-xs text-amber-400/80 mt-2">
            Dispositivo sin parear · Elige un portal para iniciar el pairing
          </p>
        ) : null}
      </div>

      {/* Portal cards */}
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
