"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Users, Building2 } from "lucide-react";
import { UnifiedLoginCard } from "@/components/auth/UnifiedLoginCard";

// Kept in sync with GuardPortalClient for the session detection pass.
const GUARD_SESSION_KEY = "guard_portal_session";
const GUARD_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ActiveSession = "guardia" | "supervisor" | "cliente";
type HubState = "loading" | "login" | "redirecting" | "select";

interface SessionCheckResult {
  guardia: boolean;
  supervisor: boolean;
  cliente: boolean;
  tenantId?: string | null;
}

interface TenantBrand {
  commercialName?: string;
  brandingLogoWhite?: string;
}

async function fetchBranding(): Promise<TenantBrand | null> {
  // Endpoint resolves the tenant server-side from whichever session
  // cookie the browser already has. No tenantId in the URL.
  try {
    const res = await fetch("/api/tenant/branding", {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as TenantBrand;
  } catch {
    return null;
  }
}

async function detectActiveSessions(): Promise<SessionCheckResult> {
  const result: SessionCheckResult = {
    guardia: false,
    supervisor: false,
    cliente: false,
    tenantId: null,
  };

  // Run the three checks independently — any can fail without affecting
  // the others (Promise.allSettled, not Promise.all).
  const checks = await Promise.allSettled([
    // Guardia: localStorage
    (async () => {
      try {
        const raw = localStorage.getItem(GUARD_SESSION_KEY);
        if (!raw) return null;
        const wrapped = JSON.parse(raw) as {
          session?: { guardiaId?: string; tenantId?: string };
          storedAt?: number;
        };
        if (!wrapped?.session?.guardiaId || !wrapped.storedAt) return null;
        if (Date.now() - wrapped.storedAt > GUARD_SESSION_TTL_MS) return null;
        return { tenantId: wrapped.session.tenantId ?? null };
      } catch {
        return null;
      }
    })(),
    // Supervisor: NextAuth cookie
    (async () => {
      const res = await fetch("/api/portal/supervisor/session", {
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.success || !data?.data) return null;
      return { tenantId: (data.data.tenantId ?? null) as string | null };
    })(),
    // Cliente: cookie
    (async () => {
      const res = await fetch("/api/portal/cliente/auth", {
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.success) return null;
      return { tenantId: null };
    })(),
  ]);

  if (checks[0].status === "fulfilled" && checks[0].value) {
    result.guardia = true;
    if (!result.tenantId) result.tenantId = checks[0].value.tenantId;
  }
  if (checks[1].status === "fulfilled" && checks[1].value) {
    result.supervisor = true;
    if (!result.tenantId) result.tenantId = checks[1].value.tenantId;
  }
  if (checks[2].status === "fulfilled" && checks[2].value) {
    result.cliente = true;
  }

  return result;
}

function activeList(sessions: SessionCheckResult): ActiveSession[] {
  const list: ActiveSession[] = [];
  if (sessions.guardia) list.push("guardia");
  if (sessions.supervisor) list.push("supervisor");
  if (sessions.cliente) list.push("cliente");
  return list;
}

function portalHref(role: ActiveSession): string {
  return role === "guardia"
    ? "/portal/guardia"
    : role === "supervisor"
      ? "/portal/supervisor"
      : "/portal/cliente";
}

export function PersonasHubClient() {
  const router = useRouter();
  const [state, setState] = useState<HubState>("loading");
  const [sessions, setSessions] = useState<SessionCheckResult | null>(null);
  const [tenantBrand, setTenantBrand] = useState<TenantBrand | null>(null);
  const [availableRoles, setAvailableRoles] = useState<ActiveSession[]>([]);

  useEffect(() => {
    async function init() {
      // If the OAuth callback redirected back here with ?roles=..., it means
      // the same Google email matched multiple roles. Show the mini-selector.
      try {
        const params = new URLSearchParams(window.location.search);
        const rolesParam = params.get("roles");
        if (rolesParam) {
          const roles = rolesParam
            .split(",")
            .filter(
              (r): r is ActiveSession =>
                r === "guardia" || r === "supervisor" || r === "cliente",
            );
          if (roles.length > 0) {
            setAvailableRoles(roles);
            setState("select");
            return;
          }
        }
      } catch {
        /* ignore */
      }

      const result = await detectActiveSessions();
      setSessions(result);

      // Fetch tenant branding. The endpoint resolves the tenant from the
      // session cookies automatically — if there's no session, it falls
      // back to OPAI defaults.
      fetchBranding().then((brand) => {
        if (brand) setTenantBrand(brand);
      });

      const active = activeList(result);

      if (active.length === 1) {
        setState("redirecting");
        router.replace(portalHref(active[0]));
        return;
      }

      if (active.length > 1) {
        setAvailableRoles(active);
        setState("select");
        return;
      }

      setState("login");
    }

    init();
  }, [router]);

  if (state === "loading" || state === "redirecting") {
    return (
      <HubLoadingState
        tenantBrand={tenantBrand}
        label={
          state === "loading" ? "Verificando sesión..." : "Redirigiendo..."
        }
      />
    );
  }

  if (state === "select") {
    return (
      <RoleSelector
        roles={availableRoles}
        sessions={sessions}
        tenantBrand={tenantBrand}
        onSelect={(role) => {
          setState("redirecting");
          router.replace(portalHref(role));
        }}
      />
    );
  }

  // state === "login" — delegate entirely to the shared UnifiedLoginCard.
  // The `personas` mode includes Google unified OAuth, RUT+PIN form for
  // guardia, and the "¿Eres cliente?" link.
  return <UnifiedLoginCard mode="personas" />;
}
/* ------------------------------------------------------------------ */
/*  HubLoadingState — shared by "loading" and "redirecting"             */
/* ------------------------------------------------------------------ */

function HubLoadingState({
  tenantBrand,
  label,
}: {
  tenantBrand: TenantBrand | null;
  label: string;
}) {
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
            Opai
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <div
            className="w-4 h-4 rounded-full border-2 border-teal-400/30 border-t-teal-400 animate-spin"
            aria-hidden
          />
          <span className="text-sm text-gray-400">{label}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RoleSelector — shown when the user has 2+ active sessions          */
/* ------------------------------------------------------------------ */

function RoleSelector({
  roles,
  sessions,
  tenantBrand,
  onSelect,
}: {
  roles: ActiveSession[];
  sessions: SessionCheckResult | null;
  tenantBrand: TenantBrand | null;
  onSelect: (role: ActiveSession) => void;
}) {
  const configs: Record<
    ActiveSession,
    {
      name: string;
      description: string;
      Icon: typeof Shield;
      accent: string;
      glow: string;
    }
  > = {
    guardia: {
      name: "Guardia",
      description: "Tu pauta, solicitudes y documentos",
      Icon: Shield,
      accent: "#2dd4bf",
      glow: "rgba(45,212,191,0.14)",
    },
    supervisor: {
      name: "Supervisor",
      description: "Gestión de equipo e instalaciones",
      Icon: Users,
      accent: "#8b5cf6",
      glow: "rgba(139,92,246,0.14)",
    },
    cliente: {
      name: "Cliente",
      description: "Reportes, cotizaciones e incidentes",
      Icon: Building2,
      accent: "#3b82f6",
      glow: "rgba(59,130,246,0.14)",
    },
  };

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
      <div className="flex-1 flex flex-col justify-center px-6 py-10 max-w-md mx-auto w-full">
        {/* Hero */}
        <div className="text-center mb-8">
          {tenantBrand?.brandingLogoWhite ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenantBrand.brandingLogoWhite}
              alt={tenantBrand.commercialName ?? ""}
              className="h-12 mx-auto mb-3 object-contain"
            />
          ) : (
            <div
              className="text-3xl font-bold mb-1"
              style={{ letterSpacing: "-0.02em" }}
            >
              Opai
            </div>
          )}
          {tenantBrand?.commercialName ? (
            <p className="text-sm text-[#9ca3af]">{tenantBrand.commercialName}</p>
          ) : null}
          <h1
            className="text-xl font-semibold mt-5 mb-1"
            style={{ letterSpacing: "-0.01em" }}
          >
            Elige cómo continuar
          </h1>
          <p className="text-[13px] text-[#6b7280]">
            Tienes sesión activa en varios portales
          </p>
        </div>

        {/* Cards */}
        <div className="flex flex-col gap-3">
          {roles.map((role) => {
            const cfg = configs[role];
            const Icon = cfg.Icon;
            const hasSession =
              (role === "guardia" && sessions?.guardia) ||
              (role === "supervisor" && sessions?.supervisor) ||
              (role === "cliente" && sessions?.cliente) ||
              false;
            return (
              <button
                key={role}
                type="button"
                onClick={() => onSelect(role)}
                className="relative w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.98] hover:-translate-y-0.5"
                style={{
                  padding: "18px 20px",
                  background: `linear-gradient(180deg, rgba(255,255,255,0.035), ${cfg.glow})`,
                  border: `1px solid ${cfg.accent}30`,
                  boxShadow: `0 10px 32px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  backdropFilter: "blur(18px) saturate(1.15)",
                  WebkitBackdropFilter: "blur(18px) saturate(1.15)",
                }}
              >
                {/* Top hairline */}
                <div
                  aria-hidden
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-[60%] h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${cfg.accent}, transparent)`,
                  }}
                />
                <div className="flex items-center gap-4">
                  {/* Icon chip */}
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{
                      width: "46px",
                      height: "46px",
                      borderRadius: "12px",
                      background: `${cfg.accent}14`,
                      border: `1px solid ${cfg.accent}2e`,
                      color: cfg.accent,
                    }}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className="text-[17px] font-semibold text-white"
                        style={{ letterSpacing: "-0.01em" }}
                      >
                        {cfg.name}
                      </div>
                      {hasSession ? (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: "rgba(16,185,129,0.1)",
                            border: "1px solid rgba(16,185,129,0.3)",
                            color: "#10b981",
                          }}
                        >
                          Sesión activa
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[13px] text-[#9ca3af] mt-0.5">
                      {cfg.description}
                    </div>
                  </div>
                  {/* Arrow */}
                  <div style={{ color: cfg.accent }} aria-hidden>
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
      <div className="text-center text-[11px] text-[#4b5563] pb-4">
        Opai Personas
      </div>
    </div>
  );
}
