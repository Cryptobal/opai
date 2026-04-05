"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  Home,
  Ticket,
  CalendarDays,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Fingerprint,
  FileText,
  Loader2,
  Send,
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  BarChart3,
  Phone,
  Download,
  Check,
  X,
  ChevronDown,
  MessageCircle,
  TrendingUp,
  MapPin,
  UserCheck,
  CircleCheck,
  CircleX,
  Navigation,
  Camera,
  Package,
  Siren,
  Zap,
  DollarSign,
} from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthTextInput } from "@/components/auth/AuthTextInput";
import { AuthPinInput } from "@/components/auth/AuthPinInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { IdCardIcon } from "@/components/auth/icons";
import { ChatGuardPortal } from "@/components/portal/ChatGuardPortal";
import { GuardDesempenoSection } from "@/components/portal/GuardDesempenoSection";
import { AccessControlGuardHome } from "@/components/access-control/AccessControlGuardHome";
import { AlertasCoberturaGuardiaSection } from "@/components/portal/AlertasCoberturaGuardiaSection";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { FaceCameraCapture } from "@/app/portal/marcacion/_components/FaceCameraCapture";
import { NotificationSettings } from "@/components/pwa/NotificationSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  InventoryReceptionBadge,
  receptionStatusFromMovement,
} from "@/components/inventario/InventoryReceptionBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type GuardSession,
  type GuardScheduleDay,
  type GuardTicket,
  type GuardMarcacion,
  type GuardExtraShift,
  type GuardDocument,
  type PortalSection,
  PORTAL_BOTTOM_NAV,
  PORTAL_NAV_ITEMS,
  SHIFT_CODE_LABELS,
  EXTRA_SHIFT_STATUS_LABELS,
  formatRut,
  isValidRut,
  getGreeting,
  formatClp,
} from "@/lib/guard-portal";
import { VistaPostulante } from "@/components/portal/VistaPostulante";
import {
  TICKET_TYPE_SEEDS,
  TICKET_STATUS_CONFIG,
  type TicketStatus,
} from "@/lib/tickets";

// ═══════════════════════════════════════════════════════════════
//  ICON MAP for bottom nav
// ═══════════════════════════════════════════════════════════════

const NAV_ICONS: Record<string, React.ReactNode> = {
  Home: <Home className="h-5 w-5" />,
  Ticket: <Ticket className="h-5 w-5" />,
  CalendarDays: <CalendarDays className="h-5 w-5" />,
  User: <User className="h-5 w-5" />,
  MessageCircle: <MessageCircle className="h-5 w-5" />,
  ShieldCheck: <ShieldCheck className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  Siren: <Siren className="h-5 w-5" />,
};

// ═══════════════════════════════════════════════════════════════
//  GUARD PORTAL CLIENT
// ═══════════════════════════════════════════════════════════════

const SESSION_KEY = "guard_portal_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const GOOGLE_SESSION_COOKIE = "guard_google_session";

/** Try to read session from the temporary Google OAuth cookie (base64url or signed). */
function readGoogleSessionCookie(): GuardSession | null {
  try {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const found = cookies.find((c) => c.startsWith(`${GOOGLE_SESSION_COOKIE}=`));
    if (!found) return null;
    const value = found.split("=").slice(1).join("=");
    if (!value) return null;

    let payload: string;
    if (value.includes(".")) {
      // Signed cookie: base64url.hmac — just decode the payload part
      const dotIndex = value.lastIndexOf(".");
      payload = atob(value.slice(0, dotIndex).replace(/-/g, "+").replace(/_/g, "/"));
    } else {
      // Unsigned: plain base64url
      payload = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    }

    const session = JSON.parse(payload) as GuardSession;
    if (!session?.guardiaId) return null;

    // Clear the cookie after reading
    document.cookie = `${GOOGLE_SESSION_COOKIE}=; path=/; max-age=0`;
    return session;
  } catch {
    return null;
  }
}

function readStoredSession(): GuardSession | null {
  try {
    // First check for Google OAuth session cookie
    const googleSession = readGoogleSessionCookie();
    if (googleSession) {
      // Store in localStorage and return
      localStorage.setItem(SESSION_KEY, JSON.stringify({ session: googleSession, storedAt: Date.now() }));
      return googleSession;
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const wrapped = JSON.parse(raw) as { session: GuardSession; storedAt: number };
    if (Date.now() - wrapped.storedAt > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return wrapped.session;
  } catch {
    return null;
  }
}

export function GuardPortalClient() {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section") as PortalSection | null;

  const [session, setSession] = useState<GuardSession | null>(() => {
    if (typeof window === "undefined") return null;
    return readStoredSession();
  });
  const [activeSection, setActiveSection] = useState<PortalSection>(initialSection || "inicio");

  function handleLogin(s: GuardSession) {
    setSession(s);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ session: s, storedAt: Date.now() })); } catch { /* ignore */ }
  }

  function handleLogout() {
    setSession(null);
    setActiveSection("inicio");
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    toast.success("Sesión cerrada correctamente");
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Postulante view — different UI with job offers
  if (session.isPostulante) {
    return <VistaPostulante session={session} onLogout={handleLogout} />;
  }

  return (
    <div className={`${activeSection === "chat" && session.currentInstallationId ? "h-dvh" : "min-h-screen"} bg-background flex flex-col w-full`}>
      {/* Top bar — hidden during chat for max space */}
      {/* Header hidden during chat */}
      {!(activeSection === "chat" && session.currentInstallationId) && (
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {session.firstName} {session.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {session.currentInstallationName ?? "Sin instalación"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
      )}

      {/* Chat: rendered outside main for proper height constraint */}
      {activeSection === "chat" && session.currentInstallationId ? (
        <div className="flex-1 min-h-0 overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", marginBottom: "4rem" }}>
          <ChatGuardPortal session={session} />
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto pb-16 sm:pb-20 px-4 sm:px-6">
          <PushPermissionPrompt
            portalType="guardia"
            userType="guardia"
            userId={session.guardiaId}
            tenantId={session.tenantId}
            sessionHeaders={{
              "x-guardia-id": session.guardiaId,
              "x-tenant-id": session.tenantId,
            }}
          />
          {activeSection === "inicio" && (
            <InicioSection session={session} onNavigate={setActiveSection} />
          )}
          {activeSection === "solicitudes" && (
            <SolicitudesSection session={session} />
          )}
          {activeSection === "pauta" && <PautaSection session={session} />}
          {activeSection === "perfil" && (
            <PerfilSection session={session} onLogout={handleLogout} />
          )}
          {activeSection === "protocolo" && (
            <ProtocoloSection session={session} onBack={() => setActiveSection("inicio")} />
          )}
          {activeSection === "examenes" && (
            <ExamenesSection session={session} onBack={() => setActiveSection("inicio")} />
          )}
          {activeSection === "resultados" && (
            <ResultadosSection session={session} onBack={() => setActiveSection("inicio")} />
          )}
          {activeSection === "chat" && !session.currentInstallationId && (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6">
              <MessageCircle className="h-12 w-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-sm">No tienes una instalación asignada actualmente.</p>
              <p className="text-zinc-500 text-xs mt-1">El chat se habilitará cuando estés asignado a una instalación.</p>
            </div>
          )}
          {activeSection === "marcaciones" && (
            <MarcacionesSection session={session} />
          )}
          {activeSection === "asistencia" && (
            <MarcacionesSection session={session} />
          )}
          {activeSection === "desempeno" && (
            <GuardDesempenoSection session={session} />
          )}
          {activeSection === "control-acceso" && session.currentInstallationId && (
            <AccessControlGuardHome
              installationId={session.currentInstallationId}
              installationName={session.currentInstallationName ?? "Instalación"}
              guardId={session.guardiaId}
              tenantId={session.tenantId}
            />
          )}
          {activeSection === "control-acceso" && !session.currentInstallationId && (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6">
              <Shield className="h-12 w-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-sm">No tienes una instalación asignada actualmente.</p>
              <p className="text-zinc-500 text-xs mt-1">El control de acceso se habilitará cuando estés asignado a una instalación.</p>
            </div>
          )}
          {activeSection === "equipamiento" && (
            <EquipamientoSection session={session} />
          )}
          {activeSection === "turnos-extra" && (
            <TurnosExtraSection session={session} />
          )}
          {activeSection === "alertas-cobertura" && (
            <AlertasCoberturaGuardiaSection session={session} />
          )}
          {activeSection === "documentos" && (
            <DocumentosSection session={session} />
          )}
        </main>
      )}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t w-full">
        <div className="flex items-center justify-around py-2">
          {PORTAL_BOTTOM_NAV.map((sectionKey) => {
            const navItem = PORTAL_NAV_ITEMS.find((n) => n.key === sectionKey);
            if (!navItem) return null;
            const isActive = activeSection === sectionKey;
            return (
              <button
                key={sectionKey}
                onClick={() => setActiveSection(sectionKey)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {NAV_ICONS[navItem.icon] ?? <Home className="h-5 w-5" />}
                <span className="text-[10px] font-medium">{navItem.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════

function LoginScreen({ onLogin }: { onLogin: (s: GuardSession) => void }) {
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
      const sessionData = (data.data ?? data.session) as GuardSession | undefined;
      if (!sessionData || !sessionData.guardiaId) {
        console.error("[Portal] Respuesta inesperada del servidor:", data);
        setError("Error al procesar la respuesta. Intenta nuevamente.");
        return;
      }
      toast.success("Sesión iniciada correctamente");
      onLogin(sessionData);
    } catch (err) {
      console.error("[Portal] Error de conexión:", err);
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  const ACCENT = "#2dd4bf";

  return (
    <AuthShell
      portalId="guardia"
      accent={ACCENT}
      accentRgb="45, 212, 191"
      portalName="Portal Guardia"
      portalSubtitle="Novedades y asistencia"
    >
      <AuthFormHeader title="Ingresa tu PIN" subtitle="Código de 4 dígitos asignado por tu supervisor" />

      <PWAInstallBanner
        appName="OPAI Guardias"
        appDescription="Turnos, chat y más desde tu celular"
        iconSrc="/icons/icon-192x192.png"
        variant="inline"
        dismissKey="guardia"
      />

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
          autoFocus
        />

        <label
          className="block text-xs font-medium text-[#9ca3af] mb-[7px]"
          style={{ letterSpacing: "0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          Tu PIN (4 d&iacute;gitos)
        </label>
        <AuthPinInput length={4} accent={ACCENT} value={pin} onChange={setPin} />

        {error && (
          <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
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

        <div className="text-center mt-4">
          <span className="text-xs text-[#6b7280]">&iquest;Olvidaste tu PIN? Contacta a tu supervisor</span>
        </div>
      </form>

      {/* Separator */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[#0f1729] px-2 text-[#6b7280]">o</span>
        </div>
      </div>

      {/* Google Sign-In */}
      <button
        onClick={() => { window.location.href = "/api/portal/guardia/auth/google"; }}
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
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continuar con Google
      </button>
      <p className="text-center text-xs text-[#6b7280] mt-2">
        &iquest;Primera vez? Se abrir&aacute; el formulario de postulaci&oacute;n.
      </p>
    </AuthShell>
  );
}

// ═══════════════════════════════════════════════════════════════
//  INICIO SECTION
// ═══════════════════════════════════════════════════════════════

function InicioSection({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  const greeting = getGreeting();
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [extraShiftCount, setExtraShiftCount] = useState<number | null>(null);
  const [pendingEquipConfirmCount, setPendingEquipConfirmCount] = useState(0);
  const [nextShift, setNextShift] = useState<{ date: string; turno: string | null; installationName: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Fetch tickets, extra shifts, schedule, equipamiento pendientes in parallel
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const [ticketRes, extraRes, schedRes, equipRes] = await Promise.all([
          fetch(`/api/portal/guardia/tickets?guardiaId=${session.guardiaId}`),
          fetch(`/api/portal/guardia/extra-shifts?guardiaId=${session.guardiaId}`),
          fetch(`/api/portal/guardia/schedule?guardiaId=${session.guardiaId}&month=${monthStr}`),
          fetch(`/api/portal/guardia/equipamiento?guardiaId=${session.guardiaId}`),
        ]);

        if (ticketRes.ok && !cancelled) {
          const data = await ticketRes.json();
          const tickets = data.data ?? data.tickets ?? [];
          setTicketCount(tickets.filter((t: { status: string }) => t.status !== "closed" && t.status !== "cancelled").length);
        }
        if (extraRes.ok && !cancelled) {
          const data = await extraRes.json();
          const shifts = data.data ?? [];
          setExtraShiftCount(shifts.length);
        }
        if (schedRes.ok && !cancelled) {
          const data = await schedRes.json();
          const days: GuardScheduleDay[] = data.data ?? [];
          // Calculate attendance %: work days (T) vs total so far
          const todayStr = now.toISOString().split("T")[0];
          const pastWorkDays = days.filter((d) => d.date <= todayStr && d.shiftCode === "T");
          // Simple: % of work days scheduled this month (past + future)
          const totalWorkDays = days.filter((d) => d.shiftCode === "T").length;
          if (totalWorkDays > 0) {
            // For now, show % of work days (attendance requires marcacion cross-reference)
            setAttendancePct(Math.round((pastWorkDays.length / totalWorkDays) * 100));
          }
          // Find next shift (today or future with shiftCode = T)
          const upcoming = days.find((d) => d.date >= todayStr && d.shiftCode === "T");
          if (upcoming) {
            setNextShift({
              date: upcoming.date,
              turno: upcoming.turno,
              installationName: upcoming.installationName,
            });
          }
        }
        if (equipRes.ok && !cancelled) {
          const equipData = await equipRes.json();
          const pending = equipData?.pendingConfirmations;
          setPendingEquipConfirmCount(Array.isArray(pending) ? pending.length : 0);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Greeting */}
      <div>
        <h2 className="text-lg font-semibold">
          {greeting}, {session.firstName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Bienvenido a tu portal de autoservicio
        </p>
      </div>

      {pendingEquipConfirmCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate("equipamiento")}
          className="w-full rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-left active:bg-amber-500/15 transition-colors"
        >
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
            {pendingEquipConfirmCount === 1
              ? "1 entrega de equipamiento por confirmar"
              : `${pendingEquipConfirmCount} entregas de equipamiento por confirmar`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Confirma con tu PIN de marcación en Mi equipamiento
          </p>
        </button>
      )}

      {/* Próximo turno */}
      {nextShift ? (
        <button
          onClick={() => onNavigate("pauta")}
          className="w-full rounded-xl border bg-card p-4 shadow-sm text-left active:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Próximo turno</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold tabular-nums">
                {nextShift.turno ? nextShift.turno.split("-")[0] : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const d = new Date(nextShift.date + "T12:00:00");
                  const today = new Date();
                  const todayStr = today.toISOString().split("T")[0];
                  const tomorrow = new Date(today);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const tomorrowStr = tomorrow.toISOString().split("T")[0];
                  if (nextShift.date === todayStr) return "Hoy";
                  if (nextShift.date === tomorrowStr) return "Mañana";
                  return d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
                })()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">
                {nextShift.installationName ?? session.currentInstallationName ?? "Sin asignar"}
              </p>
              {nextShift.turno && (
                <p className="text-xs text-muted-foreground">{nextShift.turno}</p>
              )}
            </div>
          </div>
        </button>
      ) : (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Próximo turno</h3>
          </div>
          <p className="text-xs text-muted-foreground">Sin turnos programados este mes.</p>
        </div>
      )}

      {/* Quick stats — clickable */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onNavigate("marcaciones")}
          className="rounded-xl border bg-card p-3 shadow-sm text-center active:bg-accent transition-colors"
        >
          <p className="text-2xl font-bold text-emerald-500">{attendancePct != null ? `${attendancePct}%` : "—"}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Asistencia mes
          </p>
        </button>
        <button
          onClick={() => onNavigate("turnos-extra")}
          className="rounded-xl border bg-card p-3 shadow-sm text-center active:bg-accent transition-colors"
        >
          <p className="text-2xl font-bold text-blue-500">{extraShiftCount ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Turnos extra
          </p>
        </button>
        <button
          onClick={() => onNavigate("solicitudes")}
          className="rounded-xl border bg-card p-3 shadow-sm text-center active:bg-accent transition-colors"
        >
          <p className="text-2xl font-bold text-amber-500">{ticketCount ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">
            Solicitudes
          </p>
        </button>
      </div>

      {/* Protocolo, Exámenes, Resultados */}
      <PortalProtocolCards session={session} onNavigate={onNavigate} />

      {/* Marcar Asistencia — acción rápida prominente */}
      <MarcarAsistenciaQuickAction session={session} />

      {/* Acciones rápidas */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Acciones rápidas</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate("solicitudes")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Ticket className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Solicitudes</p>
              <p className="text-[11px] text-muted-foreground">Crear o ver</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("pauta")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <CalendarDays className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Mi Pauta</p>
              <p className="text-[11px] text-muted-foreground">Calendario</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("marcaciones")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Fingerprint className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Marcaciones</p>
              <p className="text-[11px] text-muted-foreground">Historial</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("perfil")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <User className="h-5 w-5 text-purple-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Perfil</p>
              <p className="text-[11px] text-muted-foreground">Mis datos</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("equipamiento")}
            className="relative flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            {pendingEquipConfirmCount > 0 && (
              <span
                className="absolute top-2 right-2 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-amber-950"
                aria-label={`${pendingEquipConfirmCount} confirmaciones pendientes`}
              >
                {pendingEquipConfirmCount > 9 ? "9+" : pendingEquipConfirmCount}
              </span>
            )}
            <div className="h-9 w-10 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-teal-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Equipamiento</p>
              <p className="text-[11px] text-muted-foreground">
                {pendingEquipConfirmCount > 0
                  ? `${pendingEquipConfirmCount} por confirmar`
                  : "Uniforme y entregas"}
              </p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("documentos")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-sky-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Documentos</p>
              <p className="text-[11px] text-muted-foreground">Contratos y anexos</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("turnos-extra")}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Turnos Extra</p>
              <p className="text-[11px] text-muted-foreground">Detalle y pagos</p>
            </div>
          </button>

          <button
            onClick={() => onNavigate("alertas-cobertura")}
            className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm active:bg-accent transition-colors text-left"
          >
            <div className="h-9 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Siren className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Turnos Disponibles</p>
              <p className="text-[11px] text-muted-foreground">Ofertas de cobertura</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MARCAR ASISTENCIA — Quick Action (GPS + auto-detect tipo)
// ═══════════════════════════════════════════════════════════════

type MarcaStep = "idle" | "requesting_gps" | "camera" | "submitting" | "success" | "error";

function MarcarAsistenciaQuickAction({ session }: { session: GuardSession }) {
  const [step, setStep] = useState<MarcaStep>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [nextTipo, setNextTipo] = useState<"entrada" | "salida" | null>(null);
  const [result, setResult] = useState<{ timestamp: string; tipo: string; gpsStatus: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Check which tipo (entrada/salida) is next
  const checkNextTipo = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/portal/guardia/marcar?guardiaId=${session.guardiaId}`
      );
      if (res.ok) {
        const data = await res.json();
        setNextTipo(data.nextTipo ?? "entrada");
      } else {
        setNextTipo("entrada");
      }
    } catch {
      setNextTipo("entrada");
    }
  }, [session.guardiaId]);

  function handleStartMarcacion() {
    setStep("requesting_gps");
    setGpsError(null);
    setError(null);
    setResult(null);
    checkNextTipo();

    if (!navigator.geolocation) {
      setGpsError("Tu navegador no soporta geolocalización.");
      setCoords(null);
      setStep("camera");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStep("camera");
      },
      (err) => {
        // Resolución N°38: GPS falla no debe bloquear la marcación
        const msgs: Record<number, string> = {
          1: "Permiso de ubicación denegado. Puedes marcar sin GPS.",
          2: "No se pudo obtener la ubicación. Puedes marcar sin GPS.",
          3: "Tiempo agotado al obtener ubicación. Puedes marcar sin GPS.",
        };
        setGpsError(msgs[err.code] ?? "Error de GPS. Puedes marcar sin GPS.");
        setCoords(null);
        setStep("camera");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleConfirmMarcacion(imageBase64: string) {
    if (!nextTipo) return;
    setStep("submitting");
    setError(null);

    try {
      const res = await fetch("/api/portal/guardia/marcar-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          tenantId: session.tenantId,
          tipo: nextTipo,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          gpsAccuracy: coords?.accuracy ?? null,
          image: imageBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al registrar marcación.");
        setStep("error");
        return;
      }

      setResult({
        timestamp: data.timestamp,
        tipo: data.tipo,
        gpsStatus: data.gpsStatus ?? "sin_gps",
      });
      setStep("success");
      toast.success(
        nextTipo === "entrada" ? "Entrada registrada" : "Salida registrada"
      );
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
      setStep("error");
    }
  }

  function handleReset() {
    setStep("idle");
    setCoords(null);
    setGpsError(null);
    setNextTipo(null);
    setResult(null);
    setError(null);
    setCapturedImage(null);
  }

  if (!session.currentInstallationId) {
    return null; // No installation assigned — can't mark attendance
  }

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden">
      {/* ── Idle: show the big button ── */}
      {step === "idle" && (
        <button
          onClick={handleStartMarcacion}
          className="w-full flex items-center gap-4 bg-emerald-500/10 hover:bg-emerald-500/15 active:bg-emerald-500/20 p-4 transition-colors text-left"
        >
          <div className="h-12 w-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
            <Fingerprint className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              Marcar Asistencia
            </p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-500/70">
              Registra tu entrada o salida desde tu celular
            </p>
          </div>
          <Navigation className="h-5 w-5 text-emerald-500 shrink-0" />
        </button>
      )}

      {/* ── Requesting GPS ── */}
      {step === "requesting_gps" && (
        <div className="p-4 flex items-center gap-3 bg-blue-500/5">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <div>
            <p className="text-sm font-semibold">Obteniendo ubicación...</p>
            <p className="text-xs text-muted-foreground">Activa el GPS de tu celular</p>
          </div>
        </div>
      )}

      {/* ── Camera: capture photo for marcación ── */}
      {step === "camera" && (
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Camera className={`h-5 w-5 ${nextTipo === "salida" ? "text-sky-500" : "text-emerald-500"}`} />
            <p className="text-sm font-semibold">
              Toma una foto para registrar tu {nextTipo === "salida" ? "salida" : "entrada"}
            </p>
          </div>
          {gpsError && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{gpsError}</p>
          )}
          <FaceCameraCapture
            onCapture={(imageBase64) => {
              setCapturedImage(imageBase64);
              handleConfirmMarcacion(imageBase64);
            }}
            onCancel={handleReset}
            captureLabel={nextTipo === "salida" ? "Marcar Salida" : "Marcar Entrada"}
            captureColor={nextTipo === "salida" ? "rgba(56,189,248,0.5)" : "rgba(16,185,129,0.4)"}
          />
        </div>
      )}

      {/* ── Submitting ── */}
      {step === "submitting" && (
        <div className={`p-4 flex items-center gap-3 ${nextTipo === "salida" ? "bg-sky-500/5" : "bg-emerald-500/5"}`}>
          <Loader2 className={`h-5 w-5 animate-spin ${nextTipo === "salida" ? "text-sky-500" : "text-emerald-500"}`} />
          <p className="text-sm font-semibold">Registrando marcación...</p>
        </div>
      )}

      {/* ── Success ── */}
      {step === "success" && result && (
        <div className={`p-4 space-y-2 ${result.tipo === "salida" ? "bg-sky-500/5" : "bg-emerald-500/5"}`}>
          <div className="flex items-center gap-2">
            <CircleCheck className={`h-5 w-5 ${result.tipo === "salida" ? "text-sky-500" : "text-emerald-500"}`} />
            <p className={`text-sm font-bold ${result.tipo === "salida" ? "text-sky-700 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {result.tipo === "entrada" ? "Entrada registrada" : "Salida registrada"}
            </p>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              {new Date(result.timestamp).toLocaleString("es-CL", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            {result.gpsStatus === "fuera_rango" ? (
              <p className="flex items-center gap-1.5 text-sm font-bold text-red-600 dark:text-red-400">
                <MapPin className="h-4 w-4" />
                Marcación fuera de rango
              </p>
            ) : (
              <p className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {result.gpsStatus === "dentro_rango" ? "Dentro del rango" : "Sin GPS"}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleReset} className="mt-1">
            Listo
          </Button>
        </div>
      )}

      {/* ── Error ── */}
      {step === "error" && (
        <div className="p-4 space-y-2 bg-red-500/5">
          <div className="flex items-center gap-2">
            <CircleX className="h-5 w-5 text-red-500" />
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              {error}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => setStep("camera")} variant="destructive">
              Reintentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MARCACIONES SECTION (Historial)
// ═══════════════════════════════════════════════════════════════

function MarcacionesSection({ session }: { session: GuardSession }) {
  const [marcaciones, setMarcaciones] = useState<GuardMarcacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [fotoMarcacionUrl, setFotoMarcacionUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/marcaciones?guardiaId=${session.guardiaId}&limit=50`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMarcaciones(data.data ?? []);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, GuardMarcacion[]>();
    for (const m of marcaciones) {
      const dateKey = new Date(m.timestamp).toLocaleDateString("es-CL", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(m);
    }
    return Array.from(map.entries());
  }, [marcaciones]);

  return (
    <div className="py-5 space-y-4">
      <div className="flex items-center gap-2 px-4">
        <Fingerprint className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Mis Marcaciones</h2>
      </div>

      {/* Marcar asistencia inline */}
      <div className="px-4">
        <MarcarAsistenciaQuickAction session={session} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : marcaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <Fingerprint className="h-10 w-10 text-zinc-600 mb-2" />
          <p className="text-sm text-muted-foreground">No hay marcaciones registradas.</p>
        </div>
      ) : (
        <div className="space-y-4 px-4">
          {grouped.map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <p className="text-xs font-semibold text-muted-foreground mb-2 capitalize">
                {dateLabel}
              </p>
              <div className="space-y-2">
                {items.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm"
                  >
                    {/* Foto o ícono */}
                    {m.fotoEvidenciaUrl && !m.fotoEvidenciaUrl.startsWith("evidence:") ? (
                      <button
                        onClick={() => setFotoMarcacionUrl(m.fotoEvidenciaUrl)}
                        className="h-11 w-11 rounded-lg overflow-hidden shrink-0 border border-border hover:border-primary transition-colors"
                      >
                        <img src={m.fotoEvidenciaUrl} alt="Foto" className="h-full w-full object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          m.type === "entrada"
                            ? "bg-emerald-500/10"
                            : "bg-sky-500/10"
                        }`}
                      >
                        {m.type === "entrada" ? (
                          <UserCheck className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <LogOut className="h-4 w-4 text-sky-500" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold ${m.type === "salida" ? "text-sky-400" : "text-emerald-400"}`}>
                          {m.type === "entrada" ? "Entrada" : "Salida"}
                        </p>
                        {m.metodoId && (
                          <span className={`text-[10px] px-1.5 py-0 rounded ${
                            m.metodoId === "face_id" ? "bg-emerald-500/20 text-emerald-400" :
                            m.metodoId === "foto_evidencia" ? "bg-sky-500/20 text-sky-400" :
                            "bg-amber-500/20 text-amber-400"
                          }`}>
                            {m.metodoId === "face_id" ? "Face ID" : m.metodoId === "foto_evidencia" ? "Foto" : "PIN"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.timestamp).toLocaleTimeString("es-CL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        — {m.installationName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={m.geoValidated ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {m.geoValidated
                            ? "GPS OK"
                            : m.gpsStatus === "fuera_rango"
                              ? `Fuera (${Math.round(m.geoDistanceM ?? 0)}m)`
                              : "Sin GPS"}
                        </Badge>
                        {m.lat != null && m.lng != null && (
                          <a
                            href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3" />
                            Ver mapa
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox foto marcación */}
      {fotoMarcacionUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setFotoMarcacionUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white z-50 p-2"
            onClick={() => setFotoMarcacionUrl(null)}
          >
            <X className="h-7 w-7" />
          </button>
          <img
            src={fotoMarcacionUrl}
            alt="Foto de marcación"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SOLICITUDES SECTION
// ═══════════════════════════════════════════════════════════════

const GUARD_TICKET_TYPES = TICKET_TYPE_SEEDS.filter(
  (t) => t.origin === "guard" || t.origin === "both"
);

function SolicitudesSection({ session }: { session: GuardSession }) {
  const [tickets, setTickets] = useState<GuardTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<GuardTicket | null>(null);
  const [appealComment, setAppealComment] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/portal/guardia/tickets?guardiaId=${session.guardiaId}`
      );
      if (res.ok) {
        const data = await res.json();
        setTickets(data.data ?? data.tickets ?? []);
      }
    } catch {
      toast.error("Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType || !title.trim()) return;

    setFormLoading(true);
    try {
      const res = await fetch("/api/portal/guardia/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          tenantId: session.tenantId,
          typeSlug: selectedType,
          title: title.trim(),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Solicitud creada correctamente");
        setShowForm(false);
        setSelectedType("");
        setTitle("");
        setDescription("");
        setLoading(true);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error al crear solicitud");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setFormLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const config = TICKET_STATUS_CONFIG[status as TicketStatus];
    if (!config) {
      return <Badge variant="secondary">{status}</Badge>;
    }
    return <Badge variant={config.variant}>{config.label}</Badge>;
  }

  async function handleAppeal() {
    if (!selectedTicket || !appealComment.trim()) return;
    setAppealLoading(true);
    try {
      const res = await fetch(`/api/portal/guardia/tickets/${selectedTicket.id}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId: session.guardiaId, comment: appealComment.trim() }),
      });
      if (res.ok) {
        toast.success("Apelacion enviada");
        setSelectedTicket(null);
        setAppealComment("");
        setLoading(true);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error al apelar");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setAppealLoading(false);
    }
  }

  async function handleAcceptRejection() {
    if (!selectedTicket) return;
    setAppealLoading(true);
    try {
      const res = await fetch(`/api/portal/guardia/tickets/${selectedTicket.id}/accept-rejection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId: session.guardiaId }),
      });
      if (res.ok) {
        toast.success("Rechazo aceptado, ticket cerrado");
        setSelectedTicket(null);
        setLoading(true);
        fetchTickets();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Error");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setAppealLoading(false);
    }
  }

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Mis Solicitudes</h2>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          variant={showForm ? "outline" : "default"}
        >
          {showForm ? (
            "Cancelar"
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Nueva
            </>
          )}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreateTicket}
          className="rounded-xl border bg-card p-4 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-semibold">Nueva solicitud</h3>

          <div className="space-y-2">
            <Label htmlFor="ticket-type">Tipo de solicitud</Label>
            <select
              id="ticket-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecciona un tipo...</option>
              {GUARD_TICKET_TYPES.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-title">Título</Label>
            <Input
              id="ticket-title"
              placeholder="Describe brevemente tu solicitud"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticket-desc">Descripción (opcional)</Label>
            <textarea
              id="ticket-desc"
              rows={3}
              placeholder="Detalla tu solicitud..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <Button
            type="submit"
            disabled={formLoading || !selectedType || !title.trim()}
            className="w-full"
          >
            {formLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar solicitud
              </>
            )}
          </Button>
        </form>
      )}

      {/* Ticket detail view or ticket list */}
      {selectedTicket ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedTicket(null); setAppealComment(""); }}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{selectedTicket.title}</p>
                <p className="text-xs text-muted-foreground">{selectedTicket.code} &middot; {selectedTicket.typeName}</p>
              </div>
              {getStatusBadge(selectedTicket.status)}
            </div>
            <p className="text-xs text-muted-foreground">
              Creado: {new Date(selectedTicket.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>

          {selectedTicket.status === "rejected" && (
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-red-400">Este ticket fue rechazado</p>
              <p className="text-xs text-muted-foreground">Puedes apelar el rechazo o aceptarlo y cerrar el ticket.</p>

              <div className="space-y-2">
                <Label htmlFor="appeal-comment">Comentario de apelacion</Label>
                <textarea
                  id="appeal-comment"
                  rows={3}
                  placeholder="Explica por que deseas apelar..."
                  value={appealComment}
                  onChange={(e) => setAppealComment(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleAppeal}
                  disabled={appealLoading || !appealComment.trim()}
                  className="flex-1"
                >
                  {appealLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                  Apelar rechazo
                </Button>
                <Button
                  variant="outline"
                  onClick={handleAcceptRejection}
                  disabled={appealLoading}
                  className="flex-1"
                >
                  Aceptar rechazo
                </Button>
              </div>
            </div>
          )}

          {selectedTicket.status === "pending_approval" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
              <p className="text-sm text-amber-400">Tu solicitud esta pendiente de aprobacion</p>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            No tienes solicitudes
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Crea una nueva solicitud con el boton de arriba
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className="rounded-xl border bg-card p-4 shadow-sm space-y-2 cursor-pointer hover:bg-accent transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {ticket.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.code} &middot; {ticket.typeName}
                  </p>
                </div>
                {getStatusBadge(ticket.status)}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {new Date(ticket.createdAt).toLocaleDateString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PAUTA SECTION (Calendar)
// ═══════════════════════════════════════════════════════════════

function PautaSection({ session }: { session: GuardSession }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [schedule, setSchedule] = useState<GuardScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const monthLabel = currentDate.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });

  // Fetch schedule when month changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/schedule?guardiaId=${session.guardiaId}&month=${monthStr}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSchedule(data.data ?? data.schedule ?? []);
        }
      } catch {
        if (!cancelled) toast.error("Error al cargar pauta");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.guardiaId, monthStr]);

  function prevMonth() {
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() - 1);
      return next;
    });
  }

  function nextMonth() {
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun
  const daysInMonth = lastDayOfMonth.getDate();

  // Map schedule by date for quick lookup
  const scheduleMap = new Map<string, GuardScheduleDay>();
  schedule.forEach((s) => {
    // Normalize date to YYYY-MM-DD
    const dateKey = s.date.slice(0, 10);
    scheduleMap.set(dateKey, s);
  });

  const DAY_NAMES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

  const calendarCells: Array<{ day: number | null; scheduleDay: GuardScheduleDay | null }> = [];

  // Leading empty cells
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarCells.push({ day: null, scheduleDay: null });
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendarCells.push({
      day: d,
      scheduleDay: scheduleMap.get(dateKey) ?? null,
    });
  }

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold capitalize">{monthLabel}</h2>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto scrollbar-hide">
          <div className="min-w-[320px]">
          {/* Day header */}
          <div className="grid grid-cols-7 border-b">
            {DAY_NAMES.map((name) => (
              <div
                key={name}
                className="text-center text-[10px] sm:text-[11px] font-medium text-muted-foreground py-2"
              >
                {name}
              </div>
            ))}
          </div>

          {/* Calendar body */}
          <div className="grid grid-cols-7">
            {calendarCells.map((cell, idx) => {
              const isToday =
                cell.day !== null &&
                new Date().getDate() === cell.day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;

              const shiftCode = cell.scheduleDay?.shiftCode;
              const shiftConfig = shiftCode
                ? SHIFT_CODE_LABELS[shiftCode]
                : null;

              return (
                <div
                  key={idx}
                  className={`relative flex flex-col items-center justify-center py-2.5 border-b border-r ${
                    cell.day === null ? "bg-muted/30" : ""
                  } ${isToday ? "bg-primary/5" : ""}`}
                >
                  {cell.day !== null && (
                    <>
                      <span
                        className={`text-xs font-medium ${
                          isToday
                            ? "text-primary font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {cell.day}
                      </span>
                      {shiftConfig && (
                        <span
                          className={`mt-0.5 h-2 w-2 rounded-full ${shiftConfig.color}`}
                          title={shiftConfig.label}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Leyenda
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(SHIFT_CODE_LABELS).map(([code, config]) => (
            <div key={code} className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full shrink-0 ${config.color}`} />
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{code}</span>{" "}
                &mdash; {config.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PERFIL SECTION
// ═══════════════════════════════════════════════════════════════

interface GuardProfile {
  firstName: string;
  lastName: string;
  rut: string;
  email: string | null;
  phone: string | null;
  code: string | null;
  status: string;
  lifecycleStatus: string | null;
  installationName: string | null;
  hireDate: string | null;
  birthDate: string | null;
  addressFormatted: string | null;
  faceIdPhotoUrl: string | null;
  faceIdRegistered: boolean;
}

function PerfilSection({
  session,
  onLogout,
}: {
  session: GuardSession;
  onLogout: () => void;
}) {
  const [profile, setProfile] = useState<GuardProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/profile?guardiaId=${session.guardiaId}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProfile(data.data ?? data.profile ?? null);
        }
      } catch {
        if (!cancelled) toast.error("Error al cargar perfil");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [session.guardiaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const STATUS_LABELS: Record<string, string> = {
    active: "Activo",
    inactive: "Inactivo",
    suspended: "Suspendido",
    terminated: "Desvinculado",
    on_leave: "Con licencia",
  };

  const fields: { label: string; value: string | null }[] = profile
    ? [
        { label: "Nombre", value: `${profile.firstName} ${profile.lastName}` },
        { label: "RUT", value: profile.rut },
        { label: "Email", value: profile.email },
        { label: "Teléfono", value: profile.phone },
        { label: "Código", value: profile.code },
        { label: "Estado", value: STATUS_LABELS[profile.status] ?? profile.status },
        { label: "Instalación", value: profile.installationName },
        {
          label: "Fecha contratación",
          value: profile.hireDate
            ? new Date(profile.hireDate).toLocaleDateString("es-CL", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : null,
        },
        {
          label: "Fecha nacimiento",
          value: profile.birthDate
            ? new Date(profile.birthDate + "T12:00:00").toLocaleDateString("es-CL", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : null,
        },
        { label: "Dirección", value: profile.addressFormatted },
        { label: "Face ID", value: profile.faceIdRegistered ? "Registrado" : "No registrado" },
      ]
    : [];

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Avatar / Header */}
      <div className="flex flex-col items-center gap-3">
        {profile?.faceIdPhotoUrl ? (
          <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-primary/30">
            <img src={profile.faceIdPhotoUrl} alt="Foto" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-9 w-10 text-primary" />
          </div>
        )}
        {profile && (
          <>
            <h2 className="text-lg font-semibold text-center">
              {profile.firstName} {profile.lastName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {profile.installationName ?? "Sin instalación asignada"}
            </p>
          </>
        )}
      </div>

      {/* Profile fields */}
      {profile && (
        <div className="rounded-xl border bg-card shadow-sm divide-y">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm text-muted-foreground">
                {field.label}
              </span>
              <span className="text-sm font-semibold text-foreground text-right max-w-[60%] truncate">
                {field.value ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {!profile && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No se pudo cargar tu perfil.
          </p>
        </div>
      )}

      {/* Notification preferences */}
      <div className="rounded-xl border bg-card shadow-sm p-4">
        <h3 className="text-sm font-semibold mb-3">Notificaciones</h3>
        <NotificationSettings
          userType="guardia"
          userId={session.guardiaId}
          tenantId={session.tenantId}
          portalType="guardia"
        />
      </div>

      {/* Logout */}
      <Button
        variant="outline"
        onClick={onLogout}
        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PROTOCOL/EXAM/RESULTS CARDS FOR HOME
// ═══════════════════════════════════════════════════════════════

function PortalProtocolCards({ session, onNavigate }: { session: GuardSession; onNavigate: (s: PortalSection) => void }) {
  const [pendingExams, setPendingExams] = useState(0);
  const [avgScore, setAvgScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [examsRes, resultsRes] = await Promise.all([
          fetch(`/api/portal/guardia/exams?guardiaId=${session.guardiaId}`),
          fetch(`/api/portal/guardia/results?guardiaId=${session.guardiaId}`),
        ]);
        if (examsRes.ok && !cancelled) {
          const d = await examsRes.json();
          setPendingExams(d.data?.pending?.length ?? 0);
        }
        if (resultsRes.ok && !cancelled) {
          const d = await resultsRes.json();
          setAvgScore(d.data?.stats?.avgScore ?? null);
        }
      } catch { /* ignore */ }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  return (
    <div className="grid grid-cols-3 gap-3">
      {session.currentInstallationId && (
        <button
          onClick={() => onNavigate("protocolo")}
          className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold">Mi Protocolo</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
              {session.currentInstallationName}
            </p>
          </div>
        </button>
      )}

      <button
        onClick={() => onNavigate("examenes")}
        className="relative flex flex-col items-center gap-2 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors"
      >
        {pendingExams > 0 && (
          <span className="absolute top-2 right-2 h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {pendingExams}
          </span>
        )}
        <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
          <ClipboardCheck className="h-5 w-5 text-amber-500" />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold">Exámenes</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {pendingExams > 0 ? `${pendingExams} pendiente${pendingExams !== 1 ? "s" : ""}` : "Al día"}
          </p>
        </div>
      </button>

      <button
        onClick={() => onNavigate("resultados")}
        className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors"
      >
        <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold">Resultados</p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            {avgScore != null ? `Promedio: ${Math.round(avgScore)}%` : "Sin datos"}
          </p>
        </div>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  PROTOCOLO SECTION (read-only)
// ═══════════════════════════════════════════════════════════════

type ProtocolData = {
  sections: Array<{ id: string; title: string; icon: string; order: number; items: Array<{ id: string; title: string; description: string; order: number }> }>;
  latestVersion: { versionNumber: number; publishedAt: string | null } | null;
  stats: { sectionCount: number; itemCount: number };
  globalDocuments?: Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; createdAt: string }>;
};

function ProtocoloSection({ session, onBack }: { session: GuardSession; onBack: () => void }) {
  const [data, setData] = useState<ProtocolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/protocol?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.success) {
            const d = json.data;
            setData({
              ...d,
              latestVersion: d.version ?? d.latestVersion ?? null,
              stats: d.stats ?? { sectionCount: d.sections?.length ?? 0, itemCount: d.sections?.reduce((sum: number, s: { items: unknown[] }) => sum + (s.items?.length ?? 0), 0) ?? 0 },
            });
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="px-4 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-9 w-9">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold">📋 Protocolo de Instalación</h2>
          <p className="text-xs text-muted-foreground truncate">{session.currentInstallationName}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => toast.info("Descarga de PDF próximamente")} className="shrink-0">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">PDF</span>
        </Button>
      </div>

      {/* Version info */}
      {data?.latestVersion && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px]">v{data.latestVersion.versionNumber}</Badge>
          {data.latestVersion.publishedAt && (
            <span>Publicado {new Date(data.latestVersion.publishedAt).toLocaleDateString("es-CL")}</span>
          )}
          <span>{data.stats.sectionCount} secciones · {data.stats.itemCount} ítems</span>
        </div>
      )}

      {/* Sections accordion */}
      {!data || data.sections.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay protocolo publicado</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Tu supervisor aún no ha publicado un protocolo para esta instalación.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.sections.sort((a, b) => a.order - b.order).map((section) => {
            const isOpen = expandedSections.has(section.id);
            return (
              <div key={section.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-accent/50 transition-colors"
                >
                  <span className="text-lg">{section.icon}</span>
                  <span className="flex-1 text-sm font-semibold">{section.title}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{section.items.length}</Badge>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="border-t divide-y">
                    {section.items.sort((a, b) => a.order - b.order).map((item) => (
                      <div key={item.id} className="px-4 py-3 border-l-4 border-l-primary/30 ml-4">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Global documents (downloadable) */}
      {data?.globalDocuments && data.globalDocuments.length > 0 && (
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            Documentos de referencia
          </h3>
          <div className="space-y-2">
            {data.globalDocuments.map((doc) => (
              <a
                key={doc.id}
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border p-3 active:bg-accent transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  {doc.fileSize && (
                    <p className="text-[10px] text-muted-foreground">{(doc.fileSize / 1024 / 1024).toFixed(1)} MB</p>
                  )}
                </div>
                <Download className="h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Emergency contacts */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Phone className="h-4 w-4 text-red-500" />
          Contactos de emergencia
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "📞", label: "Supervisor", tel: session.currentInstallationName ? "+56 9 0000 0000" : "", note: "Contactar supervisor" },
            { icon: "🚔", label: "Carabineros", tel: "133", note: "" },
            { icon: "🚒", label: "Bomberos", tel: "132", note: "" },
            { icon: "🚑", label: "Ambulancia", tel: "131", note: "" },
          ].map((c) => (
            <a
              key={c.label}
              href={c.tel ? `tel:${c.tel.replace(/\s/g, "")}` : undefined}
              className="flex flex-col items-center gap-1.5 rounded-xl border p-3 active:bg-accent transition-colors text-center"
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="text-xs font-semibold">{c.label}</span>
              <span className="text-xs text-primary font-mono">{c.tel || c.note}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  EXAMENES SECTION (interactive exam, mobile-first)
// ═══════════════════════════════════════════════════════════════

type ExamListItem = {
  assignmentId: string;
  examTitle: string;
  examType: string;
  status: string;
  questionCount: number;
  passingScore: number;
  score: number | null;
  completedAt: string | null;
  sentAt: string;
};

type ExamApiItem = {
  id: string;
  examId?: string;
  title: string;
  type: string;
  status: string;
  questionCount: number;
  passingScore: number;
  score?: number | null;
  completedAt?: string | null;
  sentAt?: string;
};

type ExamDetail = {
  assignmentId: string;
  examTitle: string;
  examType: string;
  status: string;
  score: number | null;
  answers: Record<string, number> | null;
  questions: Array<{ id: string; questionText: string; options: string[]; correctAnswer?: number; order: number }>;
};

type SubmitResult = {
  score: number;
  total: number;
  correctCount: number;
  results: Array<{ questionId: string; correct: boolean; selectedAnswer: number; correctAnswer: number }>;
};

function ExamenesSection({ session, onBack }: { session: GuardSession; onBack: () => void }) {
  const [exams, setExams] = useState<{ pending: ExamListItem[]; completed: ExamListItem[] }>({ pending: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [activeExam, setActiveExam] = useState<ExamDetail | null>(null);
  const [examLoading, setExamLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [reviewMode, setReviewMode] = useState(false);

  const fetchExams = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/guardia/exams?guardiaId=${session.guardiaId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const mapItem = (a: ExamApiItem): ExamListItem => ({
            assignmentId: a.id,
            examTitle: a.title,
            examType: a.type,
            status: a.status,
            questionCount: a.questionCount,
            passingScore: a.passingScore,
            score: a.score ?? null,
            completedAt: a.completedAt ?? null,
            sentAt: a.sentAt ?? "",
          });
          setExams({
            pending: (json.data.pending ?? []).map(mapItem),
            completed: (json.data.completed ?? []).map(mapItem),
          });
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session.guardiaId]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  async function openExam(assignmentId: string) {
    setExamLoading(true);
    setResult(null);
    setReviewMode(false);
    setCurrentQ(0);
    setAnswers({});
    try {
      await fetch(`/api/portal/guardia/exams/${assignmentId}/open?guardiaId=${session.guardiaId}`, { method: "POST" });
      const res = await fetch(`/api/portal/guardia/exams/${assignmentId}?guardiaId=${session.guardiaId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const d = json.data;
          const mapped: ExamDetail = {
            assignmentId: d.id ?? d.assignmentId ?? assignmentId,
            examTitle: d.title ?? d.examTitle ?? "",
            examType: d.type ?? d.examType ?? "",
            status: d.status,
            score: d.score ?? null,
            answers: d.answers ?? null,
            questions: d.questions ?? [],
          };
          setActiveExam(mapped);
          if (mapped.status === "completed" && mapped.answers) {
            setReviewMode(true);
            setAnswers(mapped.answers);
          }
        }
      }
    } catch { toast.error("Error al cargar el examen"); }
    finally { setExamLoading(false); }
  }

  async function submitExam() {
    if (!activeExam) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/guardia/exams/${activeExam.assignmentId}/submit?guardiaId=${session.guardiaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setResult(json.data);
          await fetchExams();
        }
      } else {
        const json = await res.json();
        toast.error(json?.error ?? "Error al enviar");
      }
    } catch { toast.error("Error de conexión"); }
    finally { setSubmitting(false); }
  }

  function resetExam() {
    setActiveExam(null);
    setResult(null);
    setReviewMode(false);
    setCurrentQ(0);
    setAnswers({});
  }

  async function retakeExam(assignmentId: string) {
    setExamLoading(true);
    try {
      const res = await fetch(`/api/portal/guardia/exams/${assignmentId}/retake?guardiaId=${session.guardiaId}`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          resetExam();
          await fetchExams();
          openExam(json.data.assignmentId);
          return;
        }
      }
      const json = await res.json().catch(() => null);
      toast.error(json?.error ?? "Error al reintentar");
    } catch { toast.error("Error de conexión"); }
    finally { setExamLoading(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Result screen
  if (result && activeExam) {
    const pct = result.score;
    const emoji = pct >= 80 ? "🎉" : pct >= 60 ? "📚" : "📖";
    const msg = pct >= 80 ? "¡Excelente! Dominas el protocolo" : pct >= 60 ? "Buen intento. Revisa el protocolo para mejorar" : "Necesitas repasar el protocolo";

    return (
      <div className="px-4 py-5 space-y-5">
        <div className="flex flex-col items-center text-center py-6">
          <span className="text-5xl mb-3">{emoji}</span>
          <p className="text-4xl font-bold tabular-nums">{Math.round(pct)}%</p>
          <p className="text-sm text-muted-foreground mt-1">{result.correctCount} de {result.total} correctas</p>
          <p className="text-sm mt-2">{msg}</p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Revisión</h3>
          {activeExam.questions.sort((a, b) => a.order - b.order).map((q) => {
            const r = result.results.find((rr) => rr.questionId === q.id);
            const isCorrect = r?.correct ?? false;
            return (
              <div key={q.id} className={`rounded-xl border p-3 ${isCorrect ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-start gap-2">
                  {isCorrect ? <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{q.questionText}</p>
                    {r && (
                      <div className="mt-1.5 space-y-1">
                        <p className={`text-xs ${isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                          Tu respuesta: {q.options[r.selectedAnswer]}
                        </p>
                        {!isCorrect && (
                          <p className="text-xs text-emerald-400">
                            Correcta: {q.options[r.correctAnswer]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={resetExam} className="flex-1 h-12">← Volver</Button>
          <Button onClick={() => retakeExam(activeExam.assignmentId)} className="flex-1 h-12">🔄 Reintentar</Button>
        </div>
      </div>
    );
  }

  // Active exam - question by question
  if (activeExam && !reviewMode) {
    const questions = activeExam.questions.sort((a, b) => a.order - b.order);
    const q = questions[currentQ];
    const total = questions.length;
    const progress = ((currentQ + 1) / total) * 100;
    const selected = q ? answers[q.id] : undefined;
    const isLast = currentQ === total - 1;

    return (
      <div className="px-4 py-5 space-y-5">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>Pregunta {currentQ + 1} de {total}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Question */}
        {q && (
          <div className="space-y-4">
            <p className="text-base font-semibold leading-relaxed">{q.questionText}</p>

            <div className="space-y-3">
              {q.options.map((opt: string, idx: number) => {
                const isSelected = selected === idx;
                const letter = String.fromCharCode(65 + idx);
                return (
                  <button
                    key={idx}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                    className={`w-full flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors min-h-[52px] ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border active:border-muted-foreground/40"
                    }`}
                  >
                    <span className={`h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : letter}
                    </span>
                    <span className="text-sm flex-1">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => currentQ > 0 ? setCurrentQ(currentQ - 1) : resetExam()}
            className="flex-1 h-12"
          >
            ← {currentQ > 0 ? "Anterior" : "Salir"}
          </Button>
          {isLast ? (
            <Button
              onClick={submitExam}
              disabled={selected === undefined || submitting}
              className="flex-1 h-12"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "✅ Enviar"}
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentQ(currentQ + 1)}
              disabled={selected === undefined}
              className="flex-1 h-12"
            >
              Siguiente →
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Review completed exam
  if (activeExam && reviewMode) {
    return (
      <div className="px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={resetExam} className="shrink-0 h-9 w-9">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{activeExam.examTitle}</h2>
            <p className="text-xs text-muted-foreground">
              Nota: <span className={activeExam.score != null && activeExam.score >= 80 ? "text-emerald-400 font-bold" : activeExam.score != null && activeExam.score >= 60 ? "text-amber-400 font-bold" : "text-red-400 font-bold"}>
                {activeExam.score != null ? `${Math.round(activeExam.score)}%` : "—"}
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {activeExam.questions.sort((a, b) => a.order - b.order).map((q) => {
            const myAnswer = answers[q.id];
            const isCorrect = myAnswer === q.correctAnswer;
            return (
              <div key={q.id} className={`rounded-xl border p-3 ${isCorrect ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-start gap-2">
                  {isCorrect ? <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <X className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{q.questionText}</p>
                    <p className={`text-xs mt-1 ${isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                      Tu respuesta: {q.options[myAnswer] ?? "—"}
                    </p>
                    {!isCorrect && q.correctAnswer != null && (
                      <p className="text-xs text-emerald-400 mt-0.5">Correcta: {q.options[q.correctAnswer]}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Button onClick={() => retakeExam(activeExam.assignmentId)} className="w-full h-12">
          🔄 Reintentar examen
        </Button>
      </div>
    );
  }

  // Exam list
  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-9 w-9">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold">📝 Exámenes</h2>
      </div>

      {examLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {!examLoading && exams.pending.length === 0 && exams.completed.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No tienes exámenes asignados</p>
        </div>
      ) : !examLoading && (
        <div className="space-y-4">
          {exams.pending.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pendientes</h3>
              {exams.pending.map((e) => (
                <button
                  key={e.assignmentId}
                  onClick={() => openExam(e.assignmentId)}
                  className="w-full rounded-xl border border-amber-500/30 bg-card p-4 shadow-sm text-left active:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{e.examTitle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{e.questionCount} preguntas</p>
                    </div>
                    <Badge variant="warning" className="shrink-0 text-[10px]">Pendiente</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}

          {exams.completed.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completados</h3>
              {exams.completed.map((e) => (
                <div key={e.assignmentId} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <button
                    onClick={() => openExam(e.assignmentId)}
                    className="w-full p-4 text-left active:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{e.examTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {e.completedAt ? new Date(e.completedAt).toLocaleDateString("es-CL") : ""}
                        </p>
                      </div>
                      <span className={`text-lg font-bold tabular-nums ${(e.score ?? 0) >= 80 ? "text-emerald-500" : (e.score ?? 0) >= 60 ? "text-amber-500" : "text-red-500"}`}>
                        {e.score != null ? `${Math.round(e.score)}%` : "—"}
                      </span>
                    </div>
                  </button>
                  <div className="flex border-t border-border/50">
                    <button
                      onClick={() => openExam(e.assignmentId)}
                      className="flex-1 py-2 text-xs text-muted-foreground active:bg-accent transition-colors"
                    >
                      Ver revisión
                    </button>
                    <button
                      onClick={() => retakeExam(e.assignmentId)}
                      className="flex-1 py-2 text-xs text-primary font-medium border-l border-border/50 active:bg-accent transition-colors"
                    >
                      🔄 Reintentar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  RESULTADOS SECTION
// ═══════════════════════════════════════════════════════════════

type ResultStats = { avgScore: number | null; totalCompleted: number; totalAssigned: number; trend: "up" | "down" | "stable" | null };
type ResultEntry = { assignmentId: string; examTitle: string; examType: string; score: number; completedAt: string; passed: boolean };

function ResultadosSection({ session, onBack }: { session: GuardSession; onBack: () => void }) {
  const [stats, setStats] = useState<ResultStats | null>(null);
  const [history, setHistory] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/results?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.success) {
            setStats(json.data.stats);
            setHistory(json.data.history ?? []);
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const trendEmoji = stats?.trend === "up" ? "📈" : stats?.trend === "down" ? "📉" : "➡️";

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-9 w-9">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-semibold">📊 Mis Resultados</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
          <p className={`text-2xl font-bold tabular-nums ${(stats?.avgScore ?? 0) >= 80 ? "text-emerald-500" : (stats?.avgScore ?? 0) >= 60 ? "text-amber-500" : "text-red-500"}`}>
            {stats?.avgScore != null ? `${Math.round(stats.avgScore)}%` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">Promedio</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
          <p className="text-2xl font-bold text-blue-500 tabular-nums">
            {stats?.totalCompleted ?? 0}/{stats?.totalAssigned ?? 0}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">Completados</p>
        </div>
        <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
          <p className="text-2xl">{trendEmoji}</p>
          <p className="text-[11px] text-muted-foreground leading-tight mt-1">Tendencia</p>
        </div>
      </div>

      {/* History */}
      {history.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Sin resultados aún</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Completa un examen para ver tu historial aquí.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial</h3>
          {history.map((entry) => (
            <div key={entry.assignmentId} className="rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{entry.examTitle}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {entry.examType === "protocol" ? "📋 Protocolo" : "🛡️ Seguridad"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.completedAt).toLocaleDateString("es-CL")}
                  </span>
                </div>
              </div>
              <span className={`text-lg font-bold tabular-nums shrink-0 ${entry.score >= 80 ? "text-emerald-500" : entry.score >= 60 ? "text-amber-500" : "text-red-500"}`}>
                {Math.round(entry.score)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Equipamiento Section ──

type EquipamientoItem = {
  id: string;
  movementId: string;
  product: string;
  category: string;
  size: string | null;
  quantity: number;
  deliveredAt: string;
  installationName: string | null;
  confirmationStatus: string;
  confirmedAt: string | null;
};

type PendingConfirmation = {
  movementId: string;
  confirmationStatus: string;
};

function EquipamientoSection({ session }: { session: GuardSession }) {
  const [items, setItems] = useState<EquipamientoItem[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmResult, setConfirmResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  // Face ID / PIN toggle per movement
  const [confirmMethod, setConfirmMethod] = useState<Record<string, "face_id" | "pin">>({});
  const [pinInput, setPinInput] = useState<Record<string, string>>({});
  const [cameraActive, setCameraActive] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fetchData = () => {
    fetch(`/api/portal/guardia/equipamiento?guardiaId=${session.guardiaId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.assignments) setItems(data.assignments);
        if (data?.pendingConfirmations) setPendingConfirmations(data.pendingConfirmations);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [session.guardiaId]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startCamera = async (movementId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      setCameraActive(movementId);
      // Wait for video ref to be available
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
    } catch {
      setConfirmResult((prev) => ({
        ...prev,
        [movementId]: { ok: false, msg: "No se pudo acceder a la cámara" },
      }));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(null);
  };

  const captureAndVerify = async (movementId: string) => {
    if (!videoRef.current) return;

    // Capture frame from video
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.8);

    stopCamera();
    setConfirming(movementId);

    try {
      // Step 1: Verify face via existing face-verify endpoint
      const verifyRes = await fetch("/api/public/marcacion/face-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          installationId: session.currentInstallationId,
          tipo: "entrada", // dummy, we only need identity verification
          lat: 0,
          lng: 0,
          expectedGuardiaId: session.guardiaId,
          skipMarcacion: true, // won't create a marcacion record
        }),
      });

      // Even if the marcacion part fails, we check if identity was verified
      const verifyData = await verifyRes.json();

      // The face-verify may return the matched guardiaId and confidence
      const faceConfidence = verifyData.faceConfidence || verifyData.data?.faceConfidence;

      if (!faceConfidence || faceConfidence < 95) {
        setConfirmResult((prev) => ({
          ...prev,
          [movementId]: { ok: false, msg: "No se pudo verificar tu identidad. Intenta de nuevo o usa PIN." },
        }));
        setConfirming(null);
        return;
      }

      // Step 2: Confirm delivery with face_id method
      const confirmRes = await fetch("/api/portal/guardia/equipamiento/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementId,
          guardiaId: session.guardiaId,
          method: "face_id",
          faceConfidence,
        }),
      });
      const confirmData = await confirmRes.json();

      if (confirmData.success) {
        setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: true, msg: "Entrega confirmada con Face ID" } }));
        toast.success("Entrega confirmada con Face ID");
        fetchData();
      } else {
        setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: false, msg: confirmData.error || "Error" } }));
      }
    } catch {
      setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: false, msg: "Error de conexión" } }));
    } finally {
      setConfirming(null);
    }
  };

  const handlePinConfirm = async (movementId: string) => {
    const pin = pinInput[movementId];
    if (!pin || pin.length < 4) {
      setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: false, msg: "Ingresa tu PIN de marcación" } }));
      return;
    }

    setConfirming(movementId);
    try {
      const res = await fetch("/api/portal/guardia/equipamiento/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementId,
          guardiaId: session.guardiaId,
          method: "pin",
          pin,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: true, msg: "Entrega confirmada con PIN" } }));
        toast.success("Entrega confirmada exitosamente");
        fetchData();
      } else {
        setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: false, msg: data.error || "Error" } }));
      }
    } catch {
      setConfirmResult((prev) => ({ ...prev, [movementId]: { ok: false, msg: "Error de conexión" } }));
    } finally {
      setConfirming(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <Package className="h-12 w-12 text-zinc-600 mb-3" />
        <p className="text-zinc-400 text-sm">No tienes equipamiento asignado actualmente.</p>
        <p className="text-zinc-500 text-xs mt-1">Las entregas aparecerán aquí cuando se registren.</p>
      </div>
    );
  }

  // Group items by movementId
  const groupedByMovement = new Map<string, EquipamientoItem[]>();
  for (const item of items) {
    const existing = groupedByMovement.get(item.movementId) || [];
    existing.push(item);
    groupedByMovement.set(item.movementId, existing);
  }

  /** Rostro registrado en sistema (mejor experiencia Face ID); el toggle se muestra siempre. */
  const faceEnrolled = session.faceIdRegistered;

  return (
    <div className="p-4 space-y-3">
      <div className="mb-2">
        <h2 className="text-lg font-semibold">Mi Equipamiento</h2>
        <p className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? "ítem" : "ítems"} asignados</p>
      </div>

      {/* Pending confirmations banner */}
      {pendingConfirmations.length > 0 && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {pendingConfirmations.length} {pendingConfirmations.length === 1 ? "entrega pendiente" : "entregas pendientes"} de confirmación
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Confirma con <span className="font-medium text-foreground/90">Face ID</span> (cámara) o con tu{" "}
            <span className="font-medium text-foreground/90">PIN de marcación</span>.
            {!faceEnrolled && (
              <span className="block mt-1 text-amber-600/90 dark:text-amber-400/90">
                Si aún no tienes Face ID registrado, elige PIN o regístralo al marcar asistencia con foto.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {Array.from(groupedByMovement.entries()).map(([movementId, movItems]) => {
          const first = movItems[0];
          const isPending = first.confirmationStatus === "pending";
          const isConfirmed = first.confirmationStatus === "confirmed";
          const result = confirmResult[movementId];
          const method = confirmMethod[movementId] || (faceEnrolled ? "face_id" : "pin");

          return (
            <div key={movementId} className="rounded-lg border bg-card overflow-x-hidden shadow-sm">
              {/* Movement header */}
              <div className="p-3 border-b bg-muted/30 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Entrega del {new Date(first.deliveredAt).toLocaleDateString("es-CL")}
                    {first.installationName && ` · ${first.installationName}`}
                  </p>
                </div>
                <InventoryReceptionBadge
                  status={receptionStatusFromMovement(first.confirmationStatus)}
                />
              </div>

              {/* Items */}
              <div className="divide-y">
                {movItems.map((item) => (
                  <div key={item.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">
                        {item.product}
                        {item.size && <span className="ml-1.5 text-muted-foreground">({item.size})</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">Cantidad: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Confirmation area */}
              {isPending && !result?.ok && (
                <div className="p-3 border-t bg-muted/20 space-y-3">
                  {/* Face ID y PIN siempre visibles; Face ID requiere rostro registrado en backend para verificar */}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => { stopCamera(); setConfirmMethod((p) => ({ ...p, [movementId]: "face_id" })); }}
                      className={`flex-1 min-h-11 text-xs py-2.5 px-2 rounded-md border transition-colors ${
                        method === "face_id"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:bg-muted"
                      }`}
                    >
                      <Camera className="h-3.5 w-3.5 inline mr-1 align-middle" />
                      Face ID
                    </button>
                    <button
                      type="button"
                      onClick={() => { stopCamera(); setConfirmMethod((p) => ({ ...p, [movementId]: "pin" })); }}
                      className={`flex-1 min-h-11 text-xs py-2.5 px-2 rounded-md border transition-colors ${
                        method === "pin"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-input hover:bg-muted"
                      }`}
                    >
                      <Fingerprint className="h-3.5 w-3.5 inline mr-1 align-middle" />
                      PIN de marcación
                    </button>
                  </div>

                  {/* Face ID camera */}
                  {method === "face_id" && (
                    <div>
                      {cameraActive === movementId ? (
                        <div className="space-y-2">
                          <div className="rounded-lg overflow-hidden bg-black aspect-[4/3] max-h-[55vh] relative">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover mirror"
                              style={{ transform: "scaleX(-1)" }}
                            />
                          </div>
                          <div className="flex flex-col-reverse sm:flex-row gap-2">
                            <button
                              type="button"
                              onClick={stopCamera}
                              className="h-11 w-full sm:w-auto sm:px-4 rounded-md border border-input text-sm shrink-0"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => captureAndVerify(movementId)}
                              disabled={confirming === movementId}
                              className="flex-1 min-h-11 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {confirming === movementId ? "Verificando..." : "Capturar y confirmar"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startCamera(movementId)}
                          className="w-full min-h-12 rounded-md border-2 border-dashed border-input text-sm text-muted-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2 px-2 py-3"
                        >
                          <Camera className="h-5 w-5 shrink-0" />
                          <span className="text-left leading-snug">Abrir cámara para confirmar con Face ID</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* PIN input */}
                  {method === "pin" && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Ingresa tu PIN de marcación:</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <input
                          type="password"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="PIN"
                          value={pinInput[movementId] || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setPinInput((prev) => ({ ...prev, [movementId]: val }));
                          }}
                          className="w-full min-h-11 rounded-md border border-input bg-background px-3 text-center text-lg tracking-[0.2em] font-mono text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => handlePinConfirm(movementId)}
                          disabled={confirming === movementId}
                          className="w-full sm:w-auto shrink-0 min-h-11 px-6 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {confirming === movementId ? "…" : "Confirmar recepción"}
                        </button>
                      </div>
                    </div>
                  )}

                  {result && !result.ok && (
                    <p className="text-xs text-red-500">{result.msg}</p>
                  )}
                </div>
              )}

              {/* Confirmed footer */}
              {(isConfirmed || result?.ok) && first.confirmedAt && (
                <div className="p-2 border-t bg-emerald-500/5 text-center">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Recepcionada el {new Date(first.confirmedAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TURNOS EXTRA SECTION
// ═══════════════════════════════════════════════════════════════

function TurnosExtraSection({ session }: { session: GuardSession }) {
  const [shifts, setShifts] = useState<GuardExtraShift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/extra-shifts?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setShifts(data.data ?? []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  const statusColor: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400",
    approved: "bg-emerald-500/20 text-emerald-400",
    rejected: "bg-red-500/20 text-red-400",
    paid: "bg-blue-500/20 text-blue-400",
  };

  // Group by status for summary
  const summary = useMemo(() => {
    const s = { pending: 0, approved: 0, rejected: 0, paid: 0, totalHours: 0, totalAmount: 0 };
    for (const sh of shifts) {
      if (sh.status in s) s[sh.status as keyof typeof s]++;
      s.totalHours += sh.hours;
      if (sh.status === "paid") s.totalAmount += sh.amountClp;
    }
    return s;
  }, [shifts]);

  return (
    <div className="py-5 space-y-4 px-4">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Turnos Extra</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <Clock className="h-10 w-10 text-zinc-600 mb-2" />
          <p className="text-sm text-muted-foreground">No tienes turnos extra registrados.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
              <p className="text-xl font-bold text-amber-500">{summary.pending}</p>
              <p className="text-[11px] text-muted-foreground">Pendientes</p>
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
              <p className="text-xl font-bold text-emerald-500">{summary.approved}</p>
              <p className="text-[11px] text-muted-foreground">Aprobados</p>
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
              <p className="text-xl font-bold text-blue-500">{summary.paid}</p>
              <p className="text-[11px] text-muted-foreground">Pagados</p>
            </div>
            <div className="rounded-xl border bg-card p-3 shadow-sm text-center">
              <p className="text-xl font-bold text-foreground">{summary.totalHours}h</p>
              <p className="text-[11px] text-muted-foreground">Horas totales</p>
            </div>
          </div>

          {summary.totalAmount > 0 && (
            <div className="rounded-xl border bg-card p-4 shadow-sm text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total pagado</p>
              <p className="text-2xl font-bold text-emerald-500">{formatClp(summary.totalAmount)}</p>
            </div>
          )}

          {/* List */}
          <div className="space-y-2">
            {shifts.map((sh) => (
              <div key={sh.id} className="rounded-xl border bg-card p-3 shadow-sm flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">
                      {new Date(sh.date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor[sh.status] ?? "bg-muted text-muted-foreground"}`}>
                      {sh.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sh.installationName} · {sh.hours}h
                    {sh.amountClp > 0 && ` · ${formatClp(sh.amountClp)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENTOS / CONTRATOS SECTION
// ═══════════════════════════════════════════════════════════════

function DocumentosSection({ session }: { session: GuardSession }) {
  const [docs, setDocs] = useState<GuardDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/portal/guardia/documents?guardiaId=${session.guardiaId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setDocs(data.data ?? []);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  const TYPE_LABELS: Record<string, { label: string; color: string }> = {
    contrato: { label: "Contrato", color: "bg-blue-500/20 text-blue-400" },
    anexo: { label: "Anexo", color: "bg-purple-500/20 text-purple-400" },
    liquidacion: { label: "Liquidación", color: "bg-emerald-500/20 text-emerald-400" },
    certificado: { label: "Certificado", color: "bg-amber-500/20 text-amber-400" },
    finiquito: { label: "Finiquito", color: "bg-red-500/20 text-red-400" },
  };

  return (
    <div className="py-5 space-y-4 px-4">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Documentos y Contratos</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-center">
          <FileText className="h-10 w-10 text-zinc-600 mb-2" />
          <p className="text-sm text-muted-foreground">No hay documentos disponibles.</p>
          <p className="text-xs text-zinc-500 mt-1">Tus contratos y anexos aparecerán aquí.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const typeConfig = TYPE_LABELS[doc.type.toLowerCase()] ?? { label: doc.type, color: "bg-muted text-muted-foreground" };
            return (
              <div key={doc.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeConfig.color}`}>
                        {typeConfig.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(doc.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      Ver
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
