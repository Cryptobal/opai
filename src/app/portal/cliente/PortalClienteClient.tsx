"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { ChevronDown } from "lucide-react";
import { SplashScreen } from "@/components/pwa/SplashScreen";
import { UnifiedLoginCard } from "@/components/auth/UnifiedLoginCard";
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
import { PortalInstallationDetail } from "@/components/portal/cliente/PortalInstallationDetail";
import { PortalPersonal } from "@/components/portal/cliente/PortalPersonal";
import { PortalMarcaciones } from "@/components/portal/cliente/PortalMarcaciones";
import { PortalNosotros } from "@/components/portal/cliente/PortalNosotros";
import { PortalAccessControl } from "@/components/portal/cliente/PortalAccessControl";
import { PortalDesempeno } from "@/components/portal/cliente/PortalDesempeno";
import { PortalEquipamiento } from "@/components/portal/cliente/PortalEquipamiento";
import { CompanyPresentationView } from "@/components/portal/cliente/CompanyPresentationView";
import { PortalUserMenu } from "@/components/portal/cliente/PortalUserMenu";
import { PortalNotificacionesSheet } from "@/components/portal/cliente/PortalNotificacionesSheet";
import { ClienteSession, DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import { TourOverlay } from "@/components/portal/cliente/tour/TourOverlay";
import { useBranding } from "@/lib/branding/useBranding";
import {
  PortalSessionProvider,
  usePortalSession,
} from "@/contexts/portal-cliente-session-context";

const HEADER_LOGO_FALLBACK = "/tenants/gard/logo-blanco.svg";

export function PortalClienteClient() {
  return (
    <PortalSessionProvider>
      <PortalClienteShell />
    </PortalSessionProvider>
  );
}

function PortalClienteShell() {
  const { session, loading, applySession, clearSession } = usePortalSession();
  const searchParams = useSearchParams();
  const { branding } = useBranding();

  const initialSection = searchParams.get("section") as PortalSection | null;
  const initialEmail = searchParams.get("email") ?? "";

  const [activeSection, setActiveSection] = useState<PortalSection>(initialSection || "dashboard");
  const [selectedInstallation, setSelectedInstallation] = useState("");
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [headerLogoBroken, setHeaderLogoBroken] = useState(false);

  const headerGardLogo = branding.logoDark || branding.logoIcon || branding.logoWhite || HEADER_LOGO_FALLBACK;

  // Pick first installation when session resolves
  useEffect(() => {
    if (session && !selectedInstallation) {
      setSelectedInstallation(session.installations[0]?.id ?? "");
    }
  }, [session, selectedInstallation]);

  // Reset broken logo state when account changes
  useEffect(() => {
    setHeaderLogoBroken(false);
  }, [session?.accountId, session?.accountLogoUrl]);

  // Auto-trigger tour for prospects
  useEffect(() => {
    if (session?.isProspect && !session?.portalTourShown) {
      const timer = setTimeout(() => setShowTour(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [session]);

  async function handleTourComplete(navigateTo?: string) {
    setShowTour(false);
    if (navigateTo) setActiveSection(navigateTo as PortalSection);
    try {
      await fetch("/api/portal/cliente/tour", { method: "POST" });
    } catch {}
  }

  if (loading) return <SplashScreen />;

  if (!session) {
    return (
      <UnifiedLoginCard
        mode="cliente"
        initialEmail={initialEmail}
        onLoginSuccess={(data) => {
          const clienteSession = data as ClienteSession | undefined;
          if (!clienteSession) {
            window.location.reload();
            return;
          }
          applySession(clienteSession);
          setSelectedInstallation(clienteSession.installations?.[0]?.id ?? "");
        }}
      />
    );
  }

  const portalConfig = session.portalConfig ?? DEFAULT_PORTAL_CONFIG;

  function renderSection() {
    if (!session) return null;
    switch (activeSection) {
      case "dashboard":
        return (
          <PortalDashboard
            selectedInstallation={selectedInstallation}
            onNavigate={(s) => setActiveSection(s as PortalSection)}
          />
        );
      case "instalaciones":
        return (
          <PortalInstallations
            session={session}
            isProspect={session.isProspect}
            onSelectInstallation={(id) => {
              setSelectedInstallation(id);
              setActiveSection("instalacion-detalle");
            }}
          />
        );
      case "instalacion-detalle":
        return (
          <PortalInstallationDetail
            session={session}
            installationId={selectedInstallation}
            isProspect={session.isProspect}
            onBack={() => setActiveSection("instalaciones")}
            onNavigate={(s) => setActiveSection(s as PortalSection)}
          />
        );
      case "rondas":
        return (
          <PortalRondas
            selectedInstallation={selectedInstallation}
          />
        );
      case "marcaciones":
        return (
          <PortalMarcaciones
            session={session}
            selectedInstallation={selectedInstallation}
          />
        );
      case "posta":
        return (
          <PortalPosta
            selectedInstallation={selectedInstallation}
          />
        );
      case "tickets":
        return (
          <PortalTickets
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session.isProspect}
          />
        );
      case "chat":
        return null;
      case "alertas":
        return <PortalAlertas session={session} isProspect={session.isProspect} />;
      case "cotizaciones":
      case "propuesta":
        return (
          <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
            <PortalCotizaciones
              session={session}
              isProspect={session.isProspect}
              onNavigate={(s) => setActiveSection(s as PortalSection)}
            />
          </div>
        );
      case "documentacion":
        return (
          <PortalDocumentos
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session.isProspect}
          />
        );
      case "reportes":
        return <PortalReportes session={session} isProspect={session.isProspect} />;
      case "comparativa":
        return <PortalComparativa session={session} isProspect={session.isProspect} />;
      case "encuestas":
        return <PortalEncuestas session={session} isProspect={session.isProspect} />;
      case "personal":
        return <PortalPersonal isProspect={session.isProspect} />;
      case "presentacion":
        return <CompanyPresentationView contactId={session.contactId} />;
      case "nosotros":
        return <PortalNosotros onNavigate={(s) => setActiveSection(s as PortalSection)} />;
      case "empresa":
        return <PortalEmpresa session={session} />;
      case "desempeno":
        return (
          <PortalDesempeno
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session.isProspect}
          />
        );
      case "equipamiento":
        return (
          <PortalEquipamiento
            session={session}
            selectedInstallation={selectedInstallation}
          />
        );
      case "control-acceso":
        return (
          <PortalAccessControl
            session={session}
            selectedInstallation={selectedInstallation}
            isProspect={session.isProspect}
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

  return (
    <div className={`flex flex-col ${activeSection === "chat" ? "h-dvh" : "min-h-dvh"}`}>
      {activeSection !== "chat" && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
          <div className="flex items-center gap-3">
            {session.accountLogoUrl && !headerLogoBroken ? (
              <img
                src={session.accountLogoUrl}
                alt=""
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 object-contain"
                onError={() => setHeaderLogoBroken(true)}
              />
            ) : (
              <img src={headerGardLogo} alt="OPAI" className="h-8 object-contain" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-semibold truncate">Portal OPAI</h1>
                <span className="text-xs font-medium bg-teal-500/15 text-teal-400 px-1.5 py-0.5 rounded shrink-0">
                  OPAI
                </span>
              </div>
              <p className="text-sm text-zinc-400 truncate max-w-[200px] sm:max-w-none">
                {session.accountName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session.installations.length > 1 && activeSection === "dashboard" && (
              <div className="relative">
                <select
                  value={selectedInstallation}
                  onChange={(e) => setSelectedInstallation(e.target.value)}
                  className="h-10 sm:h-8 rounded border border-white/10 bg-white/5 px-2 pr-8 text-xs appearance-none max-w-[160px] truncate"
                >
                  {session.installations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2 h-3.5 w-3.5 pointer-events-none text-zinc-400" />
              </div>
            )}
            {session.isProspect && (
              <button
                onClick={() => setShowTour(true)}
                className="text-xs text-teal-400 border border-teal-400/30 rounded px-2 py-1 hover:bg-teal-400/10 transition-colors"
              >
                Tour
              </button>
            )}
            <PortalUserMenu
              session={session}
              onNotificaciones={() => setNotifSheetOpen(true)}
              onLogout={async () => {
                await fetch("/api/portal/cliente/logout", { method: "POST" });
                clearSession();
                setActiveSection("dashboard");
              }}
            />
          </div>
        </header>
      )}

      {activeSection === "chat" ? (
        <div className="flex-1 min-h-0 overflow-hidden pb-16">
          <ChatClientePortal session={session} />
        </div>
      ) : (
        <main className="flex-1 pb-16 sm:pb-20">
          <PushPermissionPrompt
            portalType="cliente"
            userType="contact"
            userId={session.contactId}
            tenantId={session.tenantId}
            sessionHeaders={{
              "x-contact-id": session.contactId,
              "x-tenant-id": session.tenantId,
              "x-account-id": session.accountId,
            }}
          />
          {renderSection()}
        </main>
      )}

      <PortalClienteNav
        portalConfig={portalConfig}
        activeSection={activeSection}
        onSection={setActiveSection}
        isProspect={session.isProspect}
        hasActivePresentation={session.hasActivePresentation}
      />

      <PortalNotificacionesSheet
        session={session}
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
      />

      {showTour && <TourOverlay onComplete={handleTourComplete} session={session} />}
    </div>
  );
}
