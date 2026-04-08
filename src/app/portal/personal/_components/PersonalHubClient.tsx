"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Users, Building2 } from "lucide-react";

type ActiveSession = "guardia" | "supervisor" | "cliente";
type HubState = "loading" | "select" | "redirecting";

interface SessionCheckResult {
  guardia: boolean;
  supervisor: boolean;
  cliente: boolean;
  tenantName?: string;
  tenantLogo?: string;
}

// Keep in sync with GuardPortalClient.SESSION_KEY / SESSION_TTL_MS
const GUARD_SESSION_KEY = "guard_portal_session";
const GUARD_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

async function fetchBranding(
  tenantId: string,
): Promise<{ commercialName?: string; brandingLogoWhite?: string } | null> {
  try {
    const res = await fetch(
      `/api/tenant/branding?tenantId=${encodeURIComponent(tenantId)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      commercialName?: string;
      brandingLogoWhite?: string;
    };
  } catch {
    return null;
  }
}

export function PersonalHubClient() {
  const router = useRouter();
  const [state, setState] = useState<HubState>("loading");
  const [sessions, setSessions] = useState<SessionCheckResult | null>(null);

  useEffect(() => {
    async function detectSessions() {
      const result: SessionCheckResult = {
        guardia: false,
        supervisor: false,
        cliente: false,
      };

      let primaryTenantId: string | null = null;

      // 1. Guardia session (localStorage)
      try {
        const raw = localStorage.getItem(GUARD_SESSION_KEY);
        if (raw) {
          const wrapped = JSON.parse(raw) as {
            session?: { guardiaId?: string; tenantId?: string };
            storedAt?: number;
          };
          const session = wrapped?.session;
          if (session?.guardiaId && wrapped?.storedAt) {
            const age = Date.now() - wrapped.storedAt;
            if (age < GUARD_SESSION_TTL_MS) {
              result.guardia = true;
              if (session.tenantId) primaryTenantId = session.tenantId;
            }
          }
        }
      } catch {
        /* localStorage not available */
      }

      // 2. Supervisor session (NextAuth cookie)
      try {
        const res = await fetch("/api/portal/supervisor/session", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.data) {
            result.supervisor = true;
            if (!primaryTenantId && data.data.tenantId) {
              primaryTenantId = data.data.tenantId;
            }
          }
        }
      } catch {
        /* network error */
      }

      // 3. Cliente session (cookie)
      try {
        const res = await fetch("/api/portal/cliente/auth", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success) {
            result.cliente = true;
          }
        }
      } catch {
        /* network error */
      }

      // Fetch branding if we have a tenant id
      if (primaryTenantId) {
        const brand = await fetchBranding(primaryTenantId);
        if (brand) {
          result.tenantName = brand.commercialName;
          result.tenantLogo = brand.brandingLogoWhite;
        }
      }

      setSessions(result);

      // Auto-redirect when there's exactly one active session
      const activeSessions: ActiveSession[] = [];
      if (result.guardia) activeSessions.push("guardia");
      if (result.supervisor) activeSessions.push("supervisor");
      if (result.cliente) activeSessions.push("cliente");

      if (activeSessions.length === 1) {
        setState("redirecting");
        const routes: Record<ActiveSession, string> = {
          guardia: "/portal/guardia",
          supervisor: "/portal/supervisor",
          cliente: "/portal/cliente",
        };
        router.replace(routes[activeSessions[0]]);
        return;
      }

      setState("select");
    }

    detectSessions();
  }, [router]);

  if (state === "loading" || state === "redirecting") {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#060a13]">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-2">Opai</div>
          <div className="text-sm text-gray-400">
            {state === "loading" ? "Verificando sesión..." : "Redirigiendo..."}
          </div>
        </div>
      </div>
    );
  }

  const portals = [
    {
      id: "guardia" as const,
      name: "Guardia",
      description: "Tu pauta, solicitudes y documentos",
      href: "/portal/guardia",
      Icon: Shield,
      hasSession: sessions?.guardia ?? false,
      color: "from-teal-500/20 to-teal-600/10 border-teal-500/30",
      activeColor: "from-teal-500/30 to-teal-600/20 border-teal-400/50",
    },
    {
      id: "supervisor" as const,
      name: "Supervisor",
      description: "Gestión de equipo e instalaciones",
      href: "/portal/supervisor",
      Icon: Users,
      hasSession: sessions?.supervisor ?? false,
      color: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
      activeColor: "from-purple-500/30 to-purple-600/20 border-purple-400/50",
    },
    {
      id: "cliente" as const,
      name: "Cliente",
      description: "Reportes, cotizaciones e incidentes",
      href: "/portal/cliente",
      Icon: Building2,
      hasSession: sessions?.cliente ?? false,
      color: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
      activeColor: "from-amber-500/30 to-amber-600/20 border-amber-400/50",
    },
  ];

  return (
    <div className="flex flex-col min-h-dvh bg-[#060a13] text-white p-6">
      {/* Header with branding */}
      <div className="text-center mt-8 mb-6">
        {sessions?.tenantLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sessions.tenantLogo}
            alt={sessions.tenantName ?? ""}
            className="h-12 mx-auto mb-3 object-contain"
          />
        ) : (
          <div className="text-3xl font-bold mb-1">Opai</div>
        )}
        {sessions?.tenantName ? (
          <p className="text-sm text-gray-400">{sessions.tenantName}</p>
        ) : null}
      </div>

      {/* Portal selector */}
      <div className="flex-1 flex flex-col justify-center gap-4 max-w-sm mx-auto w-full">
        {portals.map((portal) => {
          const Icon = portal.Icon;
          return (
            <button
              key={portal.id}
              onClick={() => router.push(portal.href)}
              className={`
                p-5 rounded-2xl border bg-gradient-to-br
                ${portal.hasSession ? portal.activeColor : portal.color}
                text-left transition-transform active:scale-[0.98]
                relative
              `}
            >
              {portal.hasSession ? (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400" />
              ) : null}
              <Icon className="w-7 h-7 mb-3 opacity-80" />
              <div className="text-lg font-semibold">{portal.name}</div>
              <div className="text-sm text-gray-400 mt-1">
                {portal.description}
              </div>
              {portal.hasSession ? (
                <div className="text-xs text-green-400 mt-2">Sesión activa</div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 pb-4">Opai v1.0</div>
    </div>
  );
}
