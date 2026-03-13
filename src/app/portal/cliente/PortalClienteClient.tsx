"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import {
  Loader2, ChevronDown,
} from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthTextInput } from "@/components/auth/AuthTextInput";
import { AuthPinInput } from "@/components/auth/AuthPinInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { MailIcon } from "@/components/auth/icons";
import { ChatClientePortal } from "@/components/portal/cliente/ChatClientePortal";
import { PortalDocumentos } from "@/components/portal/cliente/PortalDocumentos";
import { PortalClienteNav, PortalSection } from "@/components/portal/cliente/PortalClienteNav";
import { PortalDashboard } from "@/components/portal/cliente/PortalDashboard";
import { PortalInstallations } from "@/components/portal/cliente/PortalInstallations";
import { PortalRondas } from "@/components/portal/cliente/PortalRondas";
import { PortalPosta } from "@/components/portal/cliente/PortalPosta";
import { PortalTickets } from "@/components/portal/cliente/PortalTickets";
import { PortalAlertas } from "@/components/portal/cliente/PortalAlertas";
import { PortalCotizaciones } from "@/components/portal/cliente/PortalCotizaciones";
import { PortalReportes } from "@/components/portal/cliente/PortalReportes";
import { PortalComparativa } from "@/components/portal/cliente/PortalComparativa";
import { PortalEncuestas } from "@/components/portal/cliente/PortalEncuestas";
import { PortalEmpresa } from "@/components/portal/cliente/PortalEmpresa";
import { PortalPersonal } from "@/components/portal/cliente/PortalPersonal";

import { PortalNosotros } from "@/components/portal/cliente/PortalNosotros";
import { PortalAccessControl } from "@/components/portal/cliente/PortalAccessControl";
import { PortalDesempeno } from "@/components/portal/cliente/PortalDesempeno";
import { PortalUserMenu } from "@/components/portal/cliente/PortalUserMenu";
import { PortalNotificacionesSheet } from "@/components/portal/cliente/PortalNotificacionesSheet";
import { ClienteSession, DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import { TourOverlay } from "@/components/portal/cliente/tour/TourOverlay";

/* ── Helpers ── */


/* ══════════════════════════════════════════════════════ */

export function PortalClienteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section") as PortalSection | null;

  const [session, setSession] = useState<ClienteSession | null>(null);
  const [screen, setScreen] = useState<"login" | "dashboard">("login");
  const [activeSection, setActiveSection] = useState<PortalSection>(initialSection || "dashboard");

  /* ── Login state ── */
  const initialEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  /* ── Selected installation ── */
  const [selectedInstallation, setSelectedInstallation] = useState("");

  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [showTour, setShowTour] = useState(false);

  /* ── Restaurar sesión desde cookie al montar ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/cliente/auth", {
          method: "GET",
          credentials: "include",
        });
        const json = await res.json();
        if (cancelled || !json.success || !json.data) return;
        setSession(json.data);
        setSelectedInstallation(json.data.installations[0]?.id ?? "");
        setScreen("dashboard");
      } catch {
        // Sin sesión válida; se muestra login
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Auto-trigger tour for prospects ── */
  useEffect(() => {
    if (session?.isProspect && !session?.portalTourShown) {
      const timer = setTimeout(() => setShowTour(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [session]);

  const handleTourComplete = async (navigateTo?: string) => {
    setShowTour(false);
    if (navigateTo) setActiveSection(navigateTo as PortalSection);
    try { await fetch("/api/portal/cliente/tour", { method: "POST" }); } catch {}
  };

  /* ── Login ── */
  async function handleLogin() {
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/portal/cliente/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), pin }),
      });
      const json = await res.json();
      if (json.success) {
        setSession(json.data);
        setSelectedInstallation(json.data.installations[0]?.id ?? "");
        setScreen("dashboard");
      } else {
        setLoginError(json.error || "Error de autenticacion");
      }
    } catch {
      setLoginError("Error de conexion");
    } finally {
      setLoggingIn(false);
    }
  }

  const portalConfig = session?.portalConfig ?? DEFAULT_PORTAL_CONFIG;

  function renderSection() {
    if (!session) return null;
    switch (activeSection) {
      case "dashboard":
        return <PortalDashboard session={session} selectedInstallation={selectedInstallation} isProspect={session?.isProspect} onNavigate={(s) => setActiveSection(s as PortalSection)} />;
      case "instalaciones":
        return (
          <PortalInstallations
            session={session}
            isProspect={session?.isProspect}
            onSelectInstallation={(id) => {
              setSelectedInstallation(id);
              setActiveSection("dashboard");
            }}
          />
        );
      case "rondas":
        return (
          <PortalRondas
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session?.isProspect}
          />
        );
      case "posta":
        return (
          <PortalPosta
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session?.isProspect}
          />
        );
      case "tickets":
        return (
          <PortalTickets
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session?.isProspect}
          />
        );
      case "chat":
        return null; // Rendered outside <main> for proper height constraint
      case "alertas":
        return <PortalAlertas session={session} isProspect={session?.isProspect} />;
      case "cotizaciones":
        return (
          <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
            <PortalCotizaciones
              session={session}
              isProspect={false}
              onNavigate={(s) => setActiveSection(s as PortalSection)}
            />
          </div>
        );
      case "documentacion":
        return <PortalDocumentos session={session} selectedInstallation={selectedInstallation} isProspect={session?.isProspect} />;
      case "reportes":
        return <PortalReportes session={session} isProspect={session?.isProspect} />;
      case "comparativa":
        return <PortalComparativa session={session} isProspect={session?.isProspect} />;
      case "encuestas":
        return <PortalEncuestas session={session} isProspect={session?.isProspect} />;
      case "personal":
        return <PortalPersonal isProspect={session?.isProspect} />;
      case "propuesta":
        return (
          <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
            <PortalCotizaciones
              session={session}
              isProspect={true}
              onNavigate={(s) => setActiveSection(s as PortalSection)}
            />
          </div>
        );
      case "nosotros":
        return <PortalNosotros onNavigate={(s) => setActiveSection(s as PortalSection)} />;
      case "empresa":
        return <PortalEmpresa session={session} />;
      case "desempeno":
        return <PortalDesempeno session={session} selectedInstallation={selectedInstallation} isProspect={session?.isProspect} />;
      case "control-acceso":
        return (
          <PortalAccessControl
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session?.isProspect}
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-600">
            <p className="text-sm">Seccion en desarrollo</p>
          </div>
        );
    }
  }

  /* ── Mientras se restaura la sesión desde la cookie ── */
  if (restoringSession) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════ LOGIN ══════════════════════════════════════ */
  if (screen === "login") {
    const ACCENT = "#3b82f6";
    return (
      <AuthShell
        portalId="cliente"
        accent={ACCENT}
        accentRgb="59, 130, 246"
        portalName="Cliente"
        portalSubtitle="Portal de Servicios"
      >
        <AuthFormHeader title="Portal Gard Security" subtitle="powered by OPAI" />
        <p className="text-sm text-[#9ca3af] text-center max-w-xs mx-auto -mt-2 mb-4">
          El único sistema operativo integral de seguridad privada en Chile. Visibilidad total de tu servicio en tiempo real.
        </p>

        <PWAInstallBanner
          appName="OPAI Clientes"
          appDescription="Tu portal de seguridad siempre disponible"
          iconSrc="/icons/icon-192x192.png"
          variant="inline"
          dismissKey="cliente"
        />

        <div>
          <AuthTextInput
            label="Correo electrónico"
            accent={ACCENT}
            icon={<MailIcon />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@empresa.com"
            type="email"
          />

          <label
            className="block text-xs font-medium text-[#9ca3af] mb-[7px]"
            style={{ letterSpacing: "0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            PIN de acceso (4 dígitos)
          </label>
          <AuthPinInput length={4} accent={ACCENT} value={pin} onChange={setPin} />

          {loginError && (
            <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-xs text-red-400 text-center">{loginError}</p>
            </div>
          )}

          <AuthButton
            accent={ACCENT}
            label="Ingresar al Portal"
            onClick={handleLogin}
            disabled={loggingIn || !email.trim() || !pin}
            loading={loggingIn}
          />

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => router.push("/portal/cliente/forgot-pin")}
              className="text-xs transition-colors"
              style={{ color: "#6b7280" }}
            >
              ¿Olvidaste tu PIN?
            </button>
          </div>

        </div>
      </AuthShell>
    );
  }

  /* ══════════════════════════════════════ DASHBOARD ══════════════════════════════════════ */
  return (
    <div className={`flex flex-col ${activeSection === "chat" ? "h-dvh" : "min-h-dvh"}`}>
      {/* Header — hidden during chat for max space */}
      {activeSection !== "chat" && (
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          {session?.accountLogoUrl ? (
            <img src={session.accountLogoUrl} alt="" className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 object-contain" />
          ) : (
            <img src="/logo-gard-blanco.svg" alt="Gard Security" className="h-8 object-contain" />
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-semibold">Portal Gard</h1>
              <span className="text-[9px] font-medium bg-teal-500/15 text-teal-400 px-1.5 py-0.5 rounded">OPAI</span>
            </div>
            <p className="text-xs text-zinc-400">{session?.accountName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session && session.installations.length > 1 && activeSection === "dashboard" && (
            <div className="relative">
              <select
                value={selectedInstallation}
                onChange={(e) => setSelectedInstallation(e.target.value)}
                className="h-8 rounded border border-white/10 bg-white/5 px-2 pr-7 text-xs appearance-none"
              >
                {session.installations.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-3.5 w-3.5 pointer-events-none text-zinc-400" />
            </div>
          )}
          {session?.isProspect && (
            <button
              onClick={() => setShowTour(true)}
              className="text-xs text-teal-400 border border-teal-400/30 rounded px-2 py-1 hover:bg-teal-400/10 transition-colors"
            >
              Tour
            </button>
          )}
          {session && (
            <PortalUserMenu
              session={session}
              onNotificaciones={() => setNotifSheetOpen(true)}
              onLogout={async () => {
                await fetch("/api/portal/cliente/logout", { method: "POST" });
                setSession(null);
                setScreen("login");
                setActiveSection("dashboard");
              }}
            />
          )}
        </div>
      </header>
      )}

      {/* Chat — rendered outside main for proper height constraint */}
      {activeSection === "chat" && session ? (
        <div className="flex-1 min-h-0 overflow-hidden pb-16">
          <ChatClientePortal session={session} />
        </div>
      ) : (
        <main className="flex-1 pb-20">
          {session && (
            <PushPermissionPrompt
              portalType="cliente"
              userType="contact"
              userId={session.contactId}
              tenantId={session.tenantId}
            />
          )}
          {renderSection()}
        </main>
      )}

      {/* Bottom nav */}
      <PortalClienteNav
        portalConfig={portalConfig}
        activeSection={activeSection}
        onSection={setActiveSection}
        isProspect={session?.isProspect}
      />

      {/* Notificaciones sheet */}
      {session && (
        <PortalNotificacionesSheet
          session={session}
          open={notifSheetOpen}
          onClose={() => setNotifSheetOpen(false)}
        />
      )}

      {/* Tour overlay */}
      {showTour && <TourOverlay onComplete={handleTourComplete} session={session} />}
    </div>
  );
}
