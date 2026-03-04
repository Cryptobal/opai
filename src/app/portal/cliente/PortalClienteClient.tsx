"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import {
  Shield, Loader2, LogOut, ChevronDown,
} from "lucide-react";
import { ChatClienteSection } from "@/components/portales/ChatClienteSection";
import { PortalContractsSection } from "@/components/portales/PortalContractsSection";
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
import { PortalDemoOverlay } from "@/components/portal/cliente/PortalDemoOverlay";
import { ClienteSession, DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente";

/* ── Helpers ── */

function formatRut(v: string): string {
  const clean = v.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

/* ══════════════════════════════════════════════════════ */

export function PortalClienteClient() {
  const router = useRouter();
  const [session, setSession] = useState<ClienteSession | null>(null);
  const [screen, setScreen] = useState<"login" | "dashboard">("login");
  const [activeSection, setActiveSection] = useState<PortalSection>("dashboard");

  /* ── Login state ── */
  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  /* ── Selected installation ── */
  const [selectedInstallation, setSelectedInstallation] = useState("");

  /* ── Login ── */
  async function handleLogin() {
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/portal/cliente/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: rut.replace(/[.\-]/g, ""), pin }),
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
        return <PortalDashboard session={session} selectedInstallation={selectedInstallation} />;
      case "instalaciones":
        return (
          <PortalInstallations
            session={session}
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
          />
        );
      case "posta":
        return (
          <PortalPosta
            session={session}
            selectedInstallation={selectedInstallation}
          />
        );
      case "tickets":
        return (
          <PortalTickets
            session={session}
            selectedInstallation={selectedInstallation}
          />
        );
      case "chat":
        return <ChatClienteSection session={session} />;
      case "alertas":
        return <PortalAlertas session={session} />;
      case "cotizaciones":
        return (
          <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
            <PortalCotizaciones session={session} />
          </div>
        );
      case "documentacion":
        return (
          <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
            <PortalContractsSection tenantId={session.tenantId} accountId={session.accountId} />
          </div>
        );
      case "reportes":
        return <PortalReportes session={session} />;
      case "comparativa":
        return <PortalComparativa session={session} />;
      case "encuestas":
        return <PortalEncuestas session={session} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-600">
            <p className="text-sm">Seccion en desarrollo</p>
          </div>
        );
    }
  }

  /* ══════════════════════════════════════ LOGIN ══════════════════════════════════════ */
  if (screen === "login") {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <Shield className="h-8 w-8 text-teal-400" />
              <span className="text-xl font-bold tracking-tight">Gard Security</span>
            </div>
            <h1 className="text-lg font-semibold">Portal de Seguridad</h1>
            <p className="text-sm text-zinc-400 mt-1">Ingrese con el RUT de su empresa y el PIN proporcionado</p>
          </div>

          <PWAInstallBanner
            appName="OPAI Clientes"
            appDescription="Tu portal de seguridad siempre disponible"
            iconSrc="/iconos_azul/icon-192x192.png"
            variant="inline"
            dismissKey="cliente"
          />

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">RUT Empresa</label>
              <input
                type="text"
                value={rut}
                onChange={(e) => setRut(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                maxLength={12}
                className="w-full h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                onKeyDown={(e) => e.key === "Enter" && document.getElementById("pin-input")?.focus()}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">PIN</label>
              <input
                id="pin-input"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••"
                maxLength={6}
                inputMode="numeric"
                className="w-full h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            {loginError && <p className="text-xs text-red-400 text-center">{loginError}</p>}
            <button
              onClick={handleLogin}
              disabled={loggingIn || !rut || !pin}
              className="w-full h-11 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Ingresar al portal
            </button>
            <button
              type="button"
              onClick={() => router.push("/portal/cliente/forgot-pin")}
              className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors text-center w-full mt-1"
            >
              Olvidaste tu PIN?
            </button>
          </div>

          <p className="text-[10px] text-zinc-600 text-center">
            Powered by Gard Security · Portal de cumplimiento
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════ DASHBOARD ══════════════════════════════════════ */
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-teal-400" />
          <div>
            <h1 className="text-base font-semibold">Portal de Seguridad</h1>
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
          <button
            onClick={() => {
              setSession(null);
              setScreen("login");
              setActiveSection("dashboard");
            }}
            className="p-2 rounded hover:bg-white/5 transition-colors"
          >
            <LogOut className="h-4 w-4 text-zinc-400" />
          </button>
        </div>
      </header>

      {/* Demo overlay for prospects */}
      {session?.isProspect && (
        <PortalDemoOverlay onCTA={() => setActiveSection("cotizaciones")} />
      )}

      {/* Main content */}
      <main className={`flex-1 pb-20${session?.isProspect ? " pt-10" : ""}`}>
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

      {/* Bottom nav */}
      <PortalClienteNav
        portalConfig={portalConfig}
        activeSection={activeSection}
        onSection={setActiveSection}
      />
    </div>
  );
}
