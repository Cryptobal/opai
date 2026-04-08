"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shield, Users, Building2 } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthTextInput } from "@/components/auth/AuthTextInput";
import { AuthPinInput } from "@/components/auth/AuthPinInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { IdCardIcon } from "@/components/auth/icons";
import {
  type GuardSession,
  formatRut,
  isValidRut,
} from "@/lib/guard-portal";

// Keep in sync with GuardPortalClient
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

async function fetchBranding(tenantId: string): Promise<TenantBrand | null> {
  try {
    const res = await fetch(
      `/api/tenant/branding?tenantId=${encodeURIComponent(tenantId)}`,
    );
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

      // Fetch tenant branding if we have a tenant id
      if (result.tenantId) {
        fetchBranding(result.tenantId).then((brand) => {
          if (brand) setTenantBrand(brand);
        });
      }

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

  // state === "login"
  return <UnifiedLoginScreen tenantBrand={tenantBrand} />;
}

/* ------------------------------------------------------------------ */
/*  UnifiedLoginScreen                                                  */
/* ------------------------------------------------------------------ */

function UnifiedLoginScreen({ tenantBrand }: { tenantBrand: TenantBrand | null }) {
  const router = useRouter();
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRutChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatRut(e.target.value);
    if (formatted.replace(/-/g, "").length <= 9) {
      setRut(formatted);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidRut(rut)) {
      setError("RUT inválido. Ingresa un RUT válido.");
      return;
    }
    if (pin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos.");
      return;
    }

    setLoading(true);
    try {
      // Reuse the EXISTING guardia endpoint — do NOT duplicate logic
      const res = await fetch("/api/portal/guardia/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: rut.replace(/\./g, ""), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al iniciar sesión.");
        return;
      }
      const sessionData = (data.data ?? data.session) as
        | GuardSession
        | undefined;
      if (!sessionData?.guardiaId) {
        setError("Error al procesar la respuesta. Intenta nuevamente.");
        return;
      }

      // Persist in localStorage using the same shape as GuardPortalClient
      try {
        localStorage.setItem(
          GUARD_SESSION_KEY,
          JSON.stringify({ session: sessionData, storedAt: Date.now() }),
        );
      } catch {
        /* storage unavailable — session will just not persist */
      }

      toast.success("Sesión iniciada");
      router.replace("/portal/guardia");
    } catch (err) {
      console.error("[Portal Personas] Login error:", err);
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const ACCENT = "#2dd4bf";

  return (
    <AuthShell
      portalId="personas"
      accent={ACCENT}
      accentRgb="45, 212, 191"
      portalName="Opai Personas"
      portalSubtitle={tenantBrand?.commercialName ?? "Guardia · Supervisor · Cliente"}
      showBackLink={false}
    >
      <AuthFormHeader
        title="Ingresa"
        subtitle="Con Google o tu RUT + PIN de marcación"
      />

      {/* Google Sign-In */}
      <button
        onClick={() => {
          window.location.href = "/api/portal/auth/unified-google";
        }}
        type="button"
        className="w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition-colors cursor-pointer"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          color: "#d1d5db",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Ingresar con Google
      </button>

      {/* Separator */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[#0f1729] px-2 text-[#6b7280]">o</span>
        </div>
      </div>

      {/* RUT + PIN form */}
      <form onSubmit={handleSubmit}>
        <AuthTextInput
          label="RUT"
          accent={ACCENT}
          icon={<IdCardIcon />}
          value={rut}
          onChange={handleRutChange}
          placeholder="12.345.678-9"
          maxLength={12}
          autoComplete="username"
        />

        <label
          className="block text-xs font-medium text-[#9ca3af] mb-[7px]"
          style={{
            letterSpacing: "0.02em",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Tu PIN (4 dígitos)
        </label>
        <AuthPinInput length={4} accent={ACCENT} value={pin} onChange={setPin} />

        {error && (
          <div
            className="rounded-xl px-4 py-3 mb-4"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <p className="text-xs text-red-400 text-center">{error}</p>
          </div>
        )}

        <AuthButton
          accent={ACCENT}
          label="Ingresar"
          type="submit"
          disabled={loading || !rut || pin.length < 4}
          loading={loading}
        />
      </form>

      {/* Cliente link */}
      <div className="text-center mt-5">
        <button
          type="button"
          onClick={() => router.push("/portal/cliente")}
          className="text-xs text-[#9ca3af] hover:text-white transition-colors"
        >
          ¿Eres cliente? Ingresa aquí →
        </button>
      </div>
    </AuthShell>
  );
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
