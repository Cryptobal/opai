"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldX } from "lucide-react";
import { SupervisorSession, SupervisorInstallation } from "@/lib/portal-supervisor";
import { PortalSupervisorNav, SupervisorSection } from "./PortalSupervisorNav";
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
import { SupervisorRendiciones } from "./SupervisorRendiciones";
import { SupervisorCrearRendicion } from "./SupervisorCrearRendicion";
import { SupervisorRefuerzos } from "./SupervisorRefuerzos";
import { SupervisorTickets } from "./SupervisorTickets";
import { SupervisorChat } from "./SupervisorChat";

export function PortalSupervisorClient() {
  const [session, setSession] = useState<SupervisorSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<SupervisorSection>("dashboard");
  const [selectedInstallation, setSelectedInstallation] = useState<SupervisorInstallation | null>(
    null
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeInstallationId, setActiveInstallationId] = useState<string | undefined>();
  const [showCrearTE, setShowCrearTE] = useState(false);
  const [showCrearRendicion, setShowCrearRendicion] = useState(false);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-3 bg-[#0a0a0f]">
        <Loader2 className="animate-spin text-blue-400" size={32} />
        <p className="text-sm text-zinc-500">Cargando portal...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-4 bg-[#0a0a0f] px-6 text-center">
        <ShieldX size={48} className="text-zinc-600" />
        <div>
          <h2 className="text-lg font-semibold text-white">Acceso denegado</h2>
          <p className="text-sm text-zinc-500 mt-1">
            {error ?? "No tienes instalaciones asignadas como supervisor."}
          </p>
        </div>
        <a href="/opai/login" className="text-sm text-blue-400 underline underline-offset-2">
          Iniciar sesión con otra cuenta
        </a>
      </div>
    );
  }

  function handleDashboardAction(
    action: "nueva-visita" | "novedad" | "turno-extra" | "rendicion"
  ) {
    switch (action) {
      case "nueva-visita":
        setActiveSection("visitas");
        setWizardOpen(true);
        break;
      case "turno-extra":
        setActiveSection("turnos-extra");
        break;
      case "rendicion":
        setActiveSection("rendiciones");
        break;
      // "novedad" is handled by FAB
    }
  }

  function handleInstallationAction(
    action: "nueva-visita" | "turno-extra" | "ticket" | "novedad",
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
      // "novedad" is handled by FAB
    }
    setSelectedInstallation(null);
  }

  function renderSection() {
    switch (activeSection) {
      case "dashboard":
        return (
          <SupervisorDashboard session={session!} onAction={handleDashboardAction} />
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
          <SupervisorTurnosExtra onCreateTE={() => setShowCrearTE(true)} />
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
        return <SupervisorChat session={session!} />;

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
    <div className="min-h-dvh bg-[#0a0a0f] text-white">
      <main className="pb-20">{renderSection()}</main>

      <PortalSupervisorNav
        active={activeSection}
        onChange={(s) => {
          setActiveSection(s);
          if (s !== "instalaciones") setSelectedInstallation(null);
          setShowCrearTE(false);
          setShowCrearRendicion(false);
        }}
      />

      {/* Novedad FAB — available in all sections */}
      <SupervisorNovedadRapida
        installations={session.installations}
        defaultInstallationId={
          selectedInstallation?.id ?? activeInstallationId ?? session.installations[0]?.id
        }
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
