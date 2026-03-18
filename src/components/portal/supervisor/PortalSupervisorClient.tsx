"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldX } from "lucide-react";
import { SplashScreen } from "@/components/pwa/SplashScreen";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthFormHeader } from "@/components/auth/AuthFormHeader";
import { AuthButton } from "@/components/auth/AuthButton";
import { SupervisorSession, SupervisorInstallation } from "@/lib/portal-supervisor";
import { PortalSupervisorNav, SupervisorSection, MORE_NAV } from "./PortalSupervisorNav";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SupervisorDashboard } from "./SupervisorDashboard";
import { SupervisorInstalaciones } from "./SupervisorInstalaciones";
import { SupervisorInstalacionDetail } from "./SupervisorInstalacionDetail";
import { SupervisorVisitas } from "./SupervisorVisitas";
import { SupervisorVisitaWizard } from "./SupervisorVisitaWizard";
import { SupervisorPautas } from "./SupervisorPautas";
import { SupervisorMiEquipo } from "./SupervisorMiEquipo";
import { SupervisorNovedadRapida } from "./SupervisorNovedadRapida";
import { SupervisorTurnosExtra } from "./SupervisorTurnosExtra";
import { SupervisorCrearTE } from "./SupervisorCrearTE";
import { SupervisorIngresoTE } from "./SupervisorIngresoTE";
import { SupervisorRendiciones } from "./SupervisorRendiciones";
import { SupervisorCrearRendicion } from "./SupervisorCrearRendicion";
import { SupervisorRefuerzos } from "./SupervisorRefuerzos";
import { SupervisorTickets } from "./SupervisorTickets";
import { ChatSupervisorPortal } from "./ChatSupervisorPortal";
import { SupervisorVisitasTecnicas } from "./SupervisorVisitasTecnicas";
import { VisitaTecnicaForm } from "./VisitaTecnicaForm";
import { VisitaTecnicaDetail } from "./VisitaTecnicaDetail";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { PWAInstallBanner } from "@/components/pwa/PWAInstallBanner";

export function PortalSupervisorClient() {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section") as SupervisorSection | null;

  const [session, setSession] = useState<SupervisorSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<SupervisorSection>(initialSection || "dashboard");
  const [selectedInstallation, setSelectedInstallation] = useState<SupervisorInstallation | null>(
    null
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeInstallationId, setActiveInstallationId] = useState<string | undefined>();
  const [showCrearTE, setShowCrearTE] = useState(false);
  const [showIngresoTE, setShowIngresoTE] = useState(false);
  const [showCrearRendicion, setShowCrearRendicion] = useState(false);
  const [visitaTecnicaMode, setVisitaTecnicaMode] = useState<"list" | "form" | "detail">("list");
  const [selectedVisitaTecnicaId, setSelectedVisitaTecnicaId] = useState<string | undefined>();
  const [visitaTecnicaFromCard, setVisitaTecnicaFromCard] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [novedadTrigger, setNovedadTrigger] = useState(0);
  const [visitasPendientesCount, setVisitasPendientesCount] = useState(0);

  useEffect(() => {
    fetch("/api/portal/supervisor/session")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setSession(json.data);
        } else {
          setError(json.error ?? "Sin acceso");
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/portal/supervisor/visitas-tecnicas/count")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setVisitasPendientesCount(json.data?.count ?? 0);
      })
      .catch(() => {});
  }, []);

  const ACCENT = "#8b5cf6";

  if (loading) {
    return <SplashScreen />;
  }

  if (error || !session) {
    return (
      <AuthShell
        portalId="supervisor"
        accent={ACCENT}
        accentRgb="139, 92, 246"
        portalName="Supervisor"
        portalSubtitle="Hub Operacional"
      >
        <div className="text-center py-4">
          <ShieldX size={48} className="text-[#4b5563] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#f9fafb] mb-1">Acceso denegado</h2>
          <p className="text-sm text-[#6b7280] mb-6">
            {error ?? "Sin acceso al portal de supervisor."}
          </p>
          <AuthButton
            accent={ACCENT}
            label="Iniciar sesión con otra cuenta"
            onClick={() => { window.location.href = "/opai/login"; }}
          />
        </div>
      </AuthShell>
    );
  }

  if (session.installations.length === 0) {
    return (
      <AuthShell
        portalId="supervisor"
        accent={ACCENT}
        accentRgb="139, 92, 246"
        portalName="Supervisor"
        portalSubtitle="Hub Operacional"
      >
        <div className="text-center py-4">
          <ShieldX size={48} className="text-[#4b5563] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#f9fafb] mb-1">Sin instalaciones asignadas</h2>
          <p className="text-sm text-[#6b7280] mb-2">
            Tu cuenta ({session.name}) no tiene instalaciones asignadas como supervisor.
          </p>
          <p className="text-xs text-[#4b5563]">
            Un administrador debe crear una asignación en Ops &rarr; Supervisores.
          </p>
        </div>
      </AuthShell>
    );
  }

  function handleDashboardAction(
    action: "nueva-visita" | "novedad" | "turno-extra" | "rendicion" | "visita-tecnica"
  ) {
    switch (action) {
      case "nueva-visita":
        setActiveSection("visitas");
        setWizardOpen(true);
        break;
      case "turno-extra":
        setActiveSection("turnos-extra");
        setShowIngresoTE(true);
        break;
      case "rendicion":
        setActiveSection("rendiciones");
        break;
      case "visita-tecnica":
        setActiveSection("visita-tecnica");
        setVisitaTecnicaMode("list");
        setVisitaTecnicaFromCard(true);
        break;
      case "novedad":
        setNovedadTrigger((n) => n + 1);
        break;
    }
  }

  function handleInstallationAction(
    action: "nueva-visita" | "turno-extra" | "ticket" | "novedad" | "visita-tecnica",
    installationId: string
  ) {
    setActiveInstallationId(installationId);
    switch (action) {
      case "nueva-visita":
        setActiveSection("visitas");
        setWizardOpen(true);
        break;
      case "turno-extra":
        setActiveSection("turnos-extra");
        break;
      case "ticket":
        setActiveSection("tickets");
        break;
      case "visita-tecnica":
        setActiveSection("visita-tecnica");
        setVisitaTecnicaMode("form");
        break;
      // "novedad" is handled by FAB
    }
    setSelectedInstallation(null);
  }

  function renderSection() {
    switch (activeSection) {
      case "dashboard":
        return (
          <SupervisorDashboard session={session!} onAction={handleDashboardAction} onMoreOpen={() => setMoreOpen(true)} visitasPendientes={visitasPendientesCount} />
        );

      case "visitas":
        return (
          <SupervisorVisitas
            onNewVisit={() => setWizardOpen(true)}
            onSelectVisit={(_id) => {
              // TODO: show visit detail
            }}
          />
        );

      case "pautas":
        return <SupervisorPautas installations={session!.installations} />;

      case "mi-equipo":
        return <SupervisorMiEquipo installations={session!.installations} />;

      case "turnos-extra":
        if (showIngresoTE) {
          return (
            <SupervisorIngresoTE
              onBack={() => setShowIngresoTE(false)}
              onCreated={() => { setShowIngresoTE(false); }}
            />
          );
        }
        if (showCrearTE) {
          return (
            <SupervisorCrearTE
              installations={session!.installations}
              onBack={() => setShowCrearTE(false)}
              onCreated={() => { setShowCrearTE(false); }}
            />
          );
        }
        return (
          <SupervisorTurnosExtra
            onCreateTE={() => setShowCrearTE(true)}
            onIngresoTE={() => setShowIngresoTE(true)}
          />
        );

      case "rendiciones":
        if (showCrearRendicion) {
          return (
            <SupervisorCrearRendicion
              installations={session!.installations}
              onBack={() => setShowCrearRendicion(false)}
              onCreated={() => { setShowCrearRendicion(false); }}
            />
          );
        }
        return (
          <SupervisorRendiciones
            adminId={session!.adminId}
            onCreateRendicion={() => setShowCrearRendicion(true)}
          />
        );

      case "refuerzos":
        return <SupervisorRefuerzos installations={session!.installations} />;

      case "tickets":
        return <SupervisorTickets installations={session!.installations} />;

      case "chat":
        return null; // Rendered outside <main> for proper height constraint

      case "visita-tecnica":
        if (visitaTecnicaMode === "form") {
          return (
            <VisitaTecnicaForm
              installations={session!.installations}
              onBack={() => setVisitaTecnicaMode("list")}
              onComplete={() => setVisitaTecnicaMode("list")}
            />
          );
        }
        if (visitaTecnicaMode === "detail" && selectedVisitaTecnicaId) {
          return (
            <VisitaTecnicaDetail
              visitaId={selectedVisitaTecnicaId}
              onBack={() => setVisitaTecnicaMode("list")}
            />
          );
        }
        return (
          <SupervisorVisitasTecnicas
            installations={session!.installations}
            onNew={() => setVisitaTecnicaMode("form")}
            onSelect={(v) => {
              setSelectedVisitaTecnicaId(v.id);
              setVisitaTecnicaMode("detail");
            }}
            initialFilter={visitaTecnicaFromCard && visitasPendientesCount > 0 ? "programada" : "todos"}
            autoOpenFirstPending={visitaTecnicaFromCard && visitasPendientesCount === 1}
          />
        );

      case "instalaciones":
        if (selectedInstallation) {
          return (
            <SupervisorInstalacionDetail
              installation={selectedInstallation}
              onBack={() => setSelectedInstallation(null)}
              onAction={handleInstallationAction}
            />
          );
        }
        return (
          <SupervisorInstalaciones
            tenantInstallations={session!.installations}
            onSelect={(inst) => setSelectedInstallation(inst)}
          />
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-600">
            <p className="text-sm">Sección en desarrollo</p>
            <p className="text-xs text-zinc-700 capitalize">{activeSection}</p>
          </div>
        );
    }
  }

  return (
    <div className={`${activeSection === "chat" ? "h-dvh flex flex-col" : "min-h-dvh"} bg-[#0a0a0f] text-white`}>
      {activeSection !== "chat" && (
        <div className="px-4 pt-2 space-y-2">
          <PWAInstallBanner
            appName="OPAI Supervisor"
            appDescription="Hub operacional para supervisores"
            iconSrc="/icons/icon-192x192.png"
            variant="inline"
            dismissKey="supervisor"
          />
          <PushPermissionPrompt
            portalType="app"
            userType="admin"
            userId={session.adminId}
            tenantId={session.tenantId}
          />
        </div>
      )}

      {activeSection === "chat" ? (
        <div className="flex-1 min-h-0 overflow-hidden pb-16">
          <ChatSupervisorPortal session={session} />
        </div>
      ) : (
        <main className="pb-20">{renderSection()}</main>
      )}

      <PortalSupervisorNav
        active={activeSection}
        onChange={(s) => {
          setActiveSection(s);
          if (s !== "instalaciones") setSelectedInstallation(null);
          if (s !== "visita-tecnica") {
            setVisitaTecnicaMode("list");
            setVisitaTecnicaFromCard(false);
          } else {
            setVisitaTecnicaFromCard(false);
          }
          setShowCrearTE(false);
          setShowCrearRendicion(false);
        }}
        onMoreOpen={() => setMoreOpen(true)}
        visitasPendientes={visitasPendientesCount}
      />

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="bg-zinc-950 border-zinc-800 text-white" style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 1rem)' }}>
          <SheetHeader>
            <SheetTitle className="text-white text-left">Más opciones</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pb-4">
            {MORE_NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setActiveSection(id);
                  if (id !== "instalaciones") setSelectedInstallation(null);
                  setVisitaTecnicaMode("list");
                  setVisitaTecnicaFromCard(false);
                  setShowCrearTE(false);
                  setShowCrearRendicion(false);
                  setMoreOpen(false);
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                  activeSection === id
                    ? "bg-blue-950 text-blue-400 border border-blue-800"
                    : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                <Icon size={24} />
                <span className="text-xs text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Novedad FAB — available in all sections */}
      <SupervisorNovedadRapida
        installations={session.installations}
        defaultInstallationId={
          selectedInstallation?.id ?? activeInstallationId ?? session.installations[0]?.id
        }
        openTrigger={novedadTrigger}
      />

      {/* Visit wizard — full-screen overlay */}
      {wizardOpen && (
        <SupervisorVisitaWizard
          onClose={() => {
            setWizardOpen(false);
            setActiveSection("visitas");
          }}
          onComplete={() => {
            setWizardOpen(false);
            setActiveSection("visitas");
          }}
        />
      )}
    </div>
  );
}
