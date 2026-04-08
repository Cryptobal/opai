"use client";

/**
 * UnifiedLoginCard — shared login card used by every Opai Personas login
 * entry point.
 *
 * Call sites:
 *   - /portal/personas      → mode="personas" (default Guardia RUT+PIN, Google
 *                             unified, cliente link)
 *   - /portal/guardia       → mode="guardia"
 *   - /portal/cliente       → mode="cliente"  (with optional initialEmail
 *                             from CPQ deep link)
 *   - /portal/supervisor    → mode="supervisor" (Google only)
 *
 * Visual rules:
 *   - Always rendered inside the existing <AuthShell>. Accent color and
 *     portalId are derived from the mode.
 *   - Reuses AuthTextInput / AuthPinInput / AuthButton.
 *   - The card layout, copy, error handling and Google button are the
 *     same across modes — only the form fields and target endpoint change.
 *
 * Why not a hub-level redirect? Each portal (guardia / cliente /
 * supervisor / marcacion / rondas / acceso) is its own PWA with its own
 * scope. Redirecting out of scope would break the installed app on
 * Google Play / App Store. Instead we mount the same component under
 * each scope so every PWA has a native-feeling login that still shares
 * 100% of the implementation.
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthTextInput } from "@/components/auth/AuthTextInput";
import { AuthPinInput } from "@/components/auth/AuthPinInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { IdCardIcon, MailIcon } from "@/components/auth/icons";
import {
  type GuardSession,
  formatRut,
  isValidRut,
} from "@/lib/guard-portal";

/* ------------------------------------------------------------------ */
/*  Types + constants                                                   */
/* ------------------------------------------------------------------ */

export type LoginMode = "personas" | "guardia" | "cliente" | "supervisor";

interface UnifiedLoginCardProps {
  mode: LoginMode;
  /** Pre-fill the email field (cliente only). Used by the CPQ deep-link flow. */
  initialEmail?: string;
  /** Override the success redirect. Defaults depend on mode. */
  onLoginSuccess?: (session?: unknown) => void;
}

interface ModeConfig {
  portalId: "personas" | "guardia" | "cliente" | "supervisor";
  accent: string;
  accentRgb: string;
  portalName: string;
  portalSubtitle: string;
  headerTitle: string;
  headerSubtitle: string;
  /** Show Google OAuth button */
  showGoogle: boolean;
  /** Show RUT + PIN form (guardia flow) */
  showRutPin: boolean;
  /** Show Email + PIN form (cliente flow) */
  showEmailPin: boolean;
  /** Show the "¿Eres cliente?" link pointing to /portal/cliente */
  showClienteLink: boolean;
  /** Show the "¿Eres guardia?" link pointing to /portal/personas */
  showGuardiaLink: boolean;
  /** Default redirect after successful RUT+PIN login */
  guardiaSuccessHref: string;
}

const MODE_CONFIG: Record<LoginMode, ModeConfig> = {
  personas: {
    portalId: "personas",
    accent: "#2dd4bf",
    accentRgb: "45, 212, 191",
    portalName: "Opai Personas",
    portalSubtitle: "Guardia · Supervisor · Cliente",
    headerTitle: "Ingresa",
    headerSubtitle: "Con Google o tu RUT + PIN de marcación",
    showGoogle: true,
    showRutPin: true,
    showEmailPin: false,
    showClienteLink: true,
    showGuardiaLink: false,
    guardiaSuccessHref: "/portal/guardia",
  },
  guardia: {
    portalId: "guardia",
    accent: "#2dd4bf",
    accentRgb: "45, 212, 191",
    portalName: "Portal Guardia",
    portalSubtitle: "Novedades y asistencia",
    headerTitle: "Ingresa",
    headerSubtitle: "Con Google o tu RUT + PIN de marcación",
    showGoogle: true,
    showRutPin: true,
    showEmailPin: false,
    showClienteLink: false,
    showGuardiaLink: false,
    guardiaSuccessHref: "/portal/guardia",
  },
  cliente: {
    portalId: "cliente",
    accent: "#3b82f6",
    accentRgb: "59, 130, 246",
    portalName: "Portal Cliente",
    portalSubtitle: "Reportes, cotizaciones e incidentes",
    headerTitle: "Ingresa",
    headerSubtitle: "Con Google o tu email + PIN",
    showGoogle: true,
    showRutPin: false,
    showEmailPin: true,
    showClienteLink: false,
    showGuardiaLink: true,
    guardiaSuccessHref: "/portal/guardia",
  },
  supervisor: {
    portalId: "supervisor",
    accent: "#8b5cf6",
    accentRgb: "139, 92, 246",
    portalName: "Portal Supervisor",
    portalSubtitle: "Gestión de equipo e instalaciones",
    headerTitle: "Ingresa",
    headerSubtitle: "Con tu cuenta Google corporativa",
    showGoogle: true,
    showRutPin: false,
    showEmailPin: false,
    showClienteLink: false,
    showGuardiaLink: false,
    guardiaSuccessHref: "/portal/supervisor",
  },
};

const GUARD_SESSION_KEY = "guard_portal_session";

/* ------------------------------------------------------------------ */
/*  Error-message rewrite (shared)                                      */
/* ------------------------------------------------------------------ */

/**
 * Makes the guardia auth endpoint errors friendlier in contexts where the
 * caller might actually be a cliente. Appends a hint that steers them to
 * the cliente login link.
 */
export function rewriteGuardiaAuthError(
  serverError: unknown,
  hintClienteLink: boolean,
): string {
  const msg =
    typeof serverError === "string" && serverError.length > 0
      ? serverError
      : "Error al iniciar sesión.";

  if (!hintClienteLink) return msg;

  if (/PIN incorrecto/i.test(msg)) {
    return "PIN incorrecto. Si eres guardia usa tu PIN de marcación; si eres cliente, ingresa por el link de abajo.";
  }
  if (/PIN no configurado/i.test(msg) || /RUT/i.test(msg)) {
    return `${msg} Si eres cliente, ingresa por el link de abajo.`;
  }
  return msg;
}

/* ------------------------------------------------------------------ */
/*  UnifiedLoginCard component                                          */
/* ------------------------------------------------------------------ */

export function UnifiedLoginCard({
  mode,
  initialEmail = "",
  onLoginSuccess,
}: UnifiedLoginCardProps) {
  const cfg = MODE_CONFIG[mode];
  const router = useRouter();

  /* Guardia state */
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");

  /* Cliente state */
  const [email, setEmail] = useState(initialEmail);
  const [clientePin, setClientePin] = useState("");

  /* Shared state */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRutChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatRut(e.target.value);
    if (formatted.replace(/-/g, "").length <= 9) {
      setRut(formatted);
    }
  }

  /* ── Guardia RUT + PIN submit ──────────────────────────────────── */
  async function handleGuardiaSubmit(e: FormEvent) {
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
      const res = await fetch("/api/portal/guardia/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: rut.replace(/\./g, ""), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(rewriteGuardiaAuthError(data.error, cfg.showClienteLink));
        return;
      }
      const sessionData = (data.data ?? data.session) as
        | GuardSession
        | undefined;
      if (!sessionData?.guardiaId) {
        setError("Error al procesar la respuesta. Intenta nuevamente.");
        return;
      }

      try {
        localStorage.setItem(
          GUARD_SESSION_KEY,
          JSON.stringify({ session: sessionData, storedAt: Date.now() }),
        );
      } catch {
        /* storage unavailable */
      }

      toast.success("Sesión iniciada");
      if (onLoginSuccess) {
        onLoginSuccess(sessionData);
      } else {
        router.replace(cfg.guardiaSuccessHref);
      }
    } catch (err) {
      console.error("[UnifiedLoginCard] guardia login error:", err);
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Cliente Email + PIN submit ────────────────────────────────── */
  async function handleClienteSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Ingresa un email válido.");
      return;
    }
    if (clientePin.length < 4) {
      setError("El PIN debe tener al menos 4 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/cliente/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, pin: clientePin }),
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(
          data?.error ?? "Email o PIN incorrecto. Verifica tus credenciales.",
        );
        return;
      }

      toast.success("Sesión iniciada");
      if (onLoginSuccess) {
        onLoginSuccess(data.data ?? data);
      } else {
        // Soft reload to /portal/cliente so the page re-reads the cookie
        // and renders the dashboard instead of the login card.
        window.location.href = "/portal/cliente";
      }
    } catch (err) {
      console.error("[UnifiedLoginCard] cliente login error:", err);
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <AuthShell
      portalId={cfg.portalId}
      accent={cfg.accent}
      accentRgb={cfg.accentRgb}
      portalName={cfg.portalName}
      portalSubtitle={cfg.portalSubtitle}
      showBackLink={false}
    >
      <AuthFormHeader title={cfg.headerTitle} subtitle={cfg.headerSubtitle} />

      {/* Google Sign-In */}
      {cfg.showGoogle ? (
        <button
          type="button"
          onClick={() => {
            window.location.href = "/api/portal/auth/unified-google";
          }}
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
      ) : null}

      {/* Separator — only when there's both Google AND a form */}
      {cfg.showGoogle && (cfg.showRutPin || cfg.showEmailPin) ? (
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[#0f1729] px-2 text-[#6b7280]">o</span>
          </div>
        </div>
      ) : null}

      {/* RUT + PIN form */}
      {cfg.showRutPin ? (
        <form onSubmit={handleGuardiaSubmit}>
          <AuthTextInput
            label="RUT"
            accent={cfg.accent}
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
          <AuthPinInput
            length={4}
            accent={cfg.accent}
            value={pin}
            onChange={setPin}
          />

          {error ? <ErrorBox>{error}</ErrorBox> : null}

          <AuthButton
            accent={cfg.accent}
            label="Ingresar"
            type="submit"
            disabled={loading || !rut || pin.length < 4}
            loading={loading}
          />
        </form>
      ) : null}

      {/* Email + PIN form (cliente) */}
      {cfg.showEmailPin ? (
        <form onSubmit={handleClienteSubmit}>
          <AuthTextInput
            label="Email"
            accent={cfg.accent}
            icon={<MailIcon />}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@empresa.cl"
            autoComplete="email"
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
          <AuthPinInput
            length={4}
            accent={cfg.accent}
            value={clientePin}
            onChange={setClientePin}
          />

          {error ? <ErrorBox>{error}</ErrorBox> : null}

          <AuthButton
            accent={cfg.accent}
            label="Ingresar"
            type="submit"
            disabled={loading || !email || clientePin.length < 4}
            loading={loading}
          />
        </form>
      ) : null}

      {/* Google-only mode (supervisor) — show error box at the card level */}
      {!cfg.showRutPin && !cfg.showEmailPin && error ? (
        <div className="mt-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      ) : null}

      {/* Cross-links */}
      {cfg.showClienteLink ? (
        <div className="text-center mt-5">
          <button
            type="button"
            onClick={() => router.push("/portal/cliente")}
            className="text-xs text-[#9ca3af] hover:text-white transition-colors"
          >
            ¿Eres cliente? Ingresa aquí →
          </button>
        </div>
      ) : null}

      {cfg.showGuardiaLink ? (
        <div className="text-center mt-5">
          <button
            type="button"
            onClick={() => router.push("/portal/personas")}
            className="text-xs text-[#9ca3af] hover:text-white transition-colors"
          >
            ¿Eres guardia o supervisor? Ingresa aquí →
          </button>
        </div>
      ) : null}
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                              */
/* ------------------------------------------------------------------ */

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3 mb-4"
      style={{
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
      }}
    >
      <p className="text-xs text-red-400 text-center">{children}</p>
    </div>
  );
}
