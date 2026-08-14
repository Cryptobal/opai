"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { SplashScreen } from "@/components/pwa/SplashScreen";
import { UnifiedLoginCard } from "@/components/auth/UnifiedLoginCard";
import { ChatClientePortal } from "@/components/portal/cliente/ChatClientePortal";
import { PortalDocumentos } from "@/components/portal/cliente/PortalDocumentos";
import { PortalClienteNav, PortalSection } from "@/components/portal/cliente/PortalClienteNav";
import { PortalSidebar } from "@/components/portal/cliente/PortalSidebar";
import { PortalProtocolos } from "@/components/portal/cliente/PortalProtocolos";
import { PortalDashboard } from "@/components/portal/cliente/PortalDashboard";
import { PortalInstallations } from "@/components/portal/cliente/PortalInstallations";
import { PortalRondas } from "@/components/portal/cliente/PortalRondas";
import { PortalPosta } from "@/components/portal/cliente/PortalPosta";
import { PortalBitacora } from "@/components/portal/cliente/PortalBitacora";
import { PortalCommandPalette } from "@/components/portal/cliente/PortalCommandPalette";
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
import { InstallationSwitcher } from "@/components/portal/cliente/InstallationSwitcher";
import { ClienteSession, DEFAULT_PORTAL_CONFIG } from "@/lib/portal-cliente-types";
import { TourOverlay } from "@/components/portal/cliente/tour/TourOverlay";
import { useBranding } from "@/lib/branding/useBranding";
import {
  PortalSessionProvider,
  usePortalSession,
} from "@/contexts/portal-cliente-session-context";
import {
  SelectedInstallationProvider,
  useSelectedInstallation,
} from "@/contexts/selected-installation-context";
import { NativePushRegistrar } from "@/lib/capacitor/NativePushRegistrar";
import { SolicitarPropuestaSheet } from "@/components/portal/cliente/SolicitarPropuestaSheet";
import { Bell } from "lucide-react";

const HEADER_LOGO_FALLBACK = "/tenants/gard/logo-blanco.svg";

export function PortalClienteClient() {
  return (
    <PortalSessionProvider>
      <PortalClienteShellWrapper />
    </PortalSessionProvider>
  );
}

/**
 * Monta el `SelectedInstallationProvider` una vez resuelta la sesión, de modo
 * que el provider siempre tenga la lista real de instalaciones autorizadas.
 */
function PortalClienteShellWrapper() {
  const { session } = usePortalSession();
  const installations = session?.installations ?? [];
  return (
    <SelectedInstallationProvider installations={installations}>
      <PortalClienteShell />
    </SelectedInstallationProvider>
  );
}

function PortalClienteShell() {
  const { session, loading, applySession, clearSession } = usePortalSession();
  const { installationId: selectedInstallation, setInstallationId } =
    useSelectedInstallation();
  const searchParams = useSearchParams();
  const { branding } = useBranding();

  const initialSection = searchParams.get("section") as PortalSection | null;
  const initialEmail = searchParams.get("email") ?? "";

  const [activeSection, setActiveSection] = useState<PortalSection>(initialSection || "dashboard");
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [headerLogoBroken, setHeaderLogoBroken] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [leadSheetOpen, setLeadSheetOpen] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const headerGardLogo = branding.logoDark || branding.logoIcon || branding.logoWhite || HEADER_LOGO_FALLBACK;

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
          // El provider recalculará la instalación inicial desde la nueva sesión.
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
            onOpenLead={() => setLeadSheetOpen(true)}
          />
        );
      case "instalaciones":
        return (
          <PortalInstallations
            session={session}
            isProspect={session.isProspect}
            onSelectInstallation={(id) => {
              setInstallationId(id);
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
      case "bitacora":
        return (
          <PortalBitacora selectedInstallation={selectedInstallation} />
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
          <div className="py-4">
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
      case "protocolos":
        return (
          <PortalProtocolos
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
        return (
          <PortalNosotros
            onNavigate={(s) => setActiveSection(s as PortalSection)}
            onOpenLead={() => setLeadSheetOpen(true)}
          />
        );
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
    <div className={`flex ${activeSection === "chat" ? "h-dvh" : "min-h-dvh"}`}>
      <PortalSidebar
        portalConfig={portalConfig}
        activeSection={activeSection}
        onSection={setActiveSection}
        isProspect={session.isProspect}
        hasActivePresentation={session.hasActivePresentation}
      />
      <div className="flex flex-col flex-1 min-w-0">
      {activeSection !== "chat" && (
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-ds-border-subtle opai-glass-strong">
          <div className="flex items-center gap-3 min-w-0">
            {session.accountLogoUrl && !headerLogoBroken ? (
              <img
                src={session.accountLogoUrl}
                alt=""
                className="h-8 w-8 rounded-lg border border-ds-border-subtle bg-ds-surface-2 object-contain"
                onError={() => setHeaderLogoBroken(true)}
              />
            ) : (
              <img src={headerGardLogo} alt="OPAI" className="h-8 object-contain" />
            )}
            <div className="min-w-0 hidden sm:block">
              <p className="text-ds-caption font-medium text-ds-text-1 truncate">{session.accountName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <InstallationSwitcher />
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              title="Buscar (⌘K)"
              className="hidden sm:inline-flex items-center gap-1.5 text-ds-caption text-ds-text-3 border border-ds-border-default rounded-full px-2.5 min-h-10 sm:min-h-9 hover:bg-ds-surface-2"
            >
              <span>Buscar</span>
              <kbd className="text-ds-caption font-mono bg-ds-surface-2 rounded px-1">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Buscar"
              className="sm:hidden min-h-11 min-w-11 inline-flex items-center justify-center text-ds-text-3 hover:text-ds-text-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-3.5-3.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setNotifSheetOpen(true)}
              aria-label="Notificaciones"
              className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-ds-text-2 hover:bg-ds-surface-2"
            >
              <Bell className="h-5 w-5" />
            </button>
            {session.isProspect && (
              <button
                onClick={() => setShowTour(true)}
                className="text-ds-caption text-status-info-fg border border-status-info-border rounded-full px-2.5 min-h-10 hover:bg-status-info-soft transition-colors"
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatClientePortal session={session} />
        </div>
      ) : (
        <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-6 pb-[var(--portal-bottom-nav-height,5rem)] md:pb-8">
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
          <NativePushRegistrar userId={session.contactId} userType="cliente" />
          {renderSection()}
        </main>
      )}

      <div className="md:hidden">
        <PortalClienteNav
          portalConfig={portalConfig}
          activeSection={activeSection}
          onSection={setActiveSection}
          isProspect={session.isProspect}
          hasActivePresentation={session.hasActivePresentation}
        />
      </div>

      <PortalNotificacionesSheet
        session={session}
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
      />

      <PortalCommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigateSection={(s) => setActiveSection(s as PortalSection)}
        onSelectInstallation={(id) => setInstallationId(id)}
      />

      {showTour && <TourOverlay onComplete={handleTourComplete} session={session} />}
      <SolicitarPropuestaSheet open={leadSheetOpen} onClose={() => setLeadSheetOpen(false)} />
      </div>
    </div>
  );
}
