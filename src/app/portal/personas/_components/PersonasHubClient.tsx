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
/*  RoleSelector                                                        */
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
      color: string;
      activeColor: string;
    }
  > = {
    guardia: {
      name: "Guardia",
      description: "Tu pauta, solicitudes y documentos",
      Icon: Shield,
      color: "from-teal-500/20 to-teal-600/10 border-teal-500/30",
      activeColor: "from-teal-500/30 to-teal-600/20 border-teal-400/50",
    },
    supervisor: {
      name: "Supervisor",
      description: "Gestión de equipo e instalaciones",
      Icon: Users,
      color: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
      activeColor: "from-purple-500/30 to-purple-600/20 border-purple-400/50",
    },
    cliente: {
      name: "Cliente",
      description: "Reportes, cotizaciones e incidentes",
      Icon: Building2,
      color: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
      activeColor: "from-amber-500/30 to-amber-600/20 border-amber-400/50",
    },
  };

  return (
    <div className="flex flex-col min-h-dvh bg-[#060a13] text-white p-6">
      <div className="text-center mt-8 mb-6">
        {tenantBrand?.brandingLogoWhite ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenantBrand.brandingLogoWhite}
            alt={tenantBrand.commercialName ?? ""}
            className="h-12 mx-auto mb-3 object-contain"
          />
        ) : (
          <div className="text-3xl font-bold mb-1">Opai</div>
        )}
        {tenantBrand?.commercialName ? (
          <p className="text-sm text-gray-400">{tenantBrand.commercialName}</p>
        ) : null}
        <p className="text-xs text-gray-500 mt-3">
          Selecciona tu portal
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-4 max-w-sm mx-auto w-full">
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
              className={`
                p-5 rounded-2xl border bg-gradient-to-br
                ${hasSession ? cfg.activeColor : cfg.color}
                text-left transition-transform active:scale-[0.98]
                relative
              `}
            >
              {hasSession ? (
                <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-400" />
              ) : null}
              <Icon className="w-7 h-7 mb-3 opacity-80" />
              <div className="text-lg font-semibold">{cfg.name}</div>
              <div className="text-sm text-gray-400 mt-1">{cfg.description}</div>
              {hasSession ? (
                <div className="text-xs text-green-400 mt-2">Sesión activa</div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="text-center text-xs text-gray-600 pb-4">Opai v1.0</div>
    </div>
  );
}
