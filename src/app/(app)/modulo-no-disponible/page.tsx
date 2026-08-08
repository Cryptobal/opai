import Link from "next/link";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/opai-ds";

const MODULE_LABELS: Record<string, string> = {
  hub: "Hub",
  config: "Configuración",
  portal_guardia: "Portal Guardia",
  portal_marcacion: "Portal Marcación",
  ops_asistencia: "Asistencia",
  ops_pauta: "Pauta",
  ops_pce: "PCE",
  ops_turnos_extra: "Turnos Extra",
  ops_refuerzos: "Refuerzos",
  ops_onboarding: "Onboarding",
  ops_audit: "Auditoría",
  personas: "Personas",
  tickets: "Tickets",
  documentos: "Documentos",
  contratos: "Contratos",
  ops_supervision: "Supervisión",
  alertas_cobertura: "Alertas Cobertura",
  chat: "Chat",
  gamificacion: "Gamificación",
  protocolos_ia: "Protocolos IA",
  reportes_dt: "Reportes DT",
  crm: "CRM",
  cpq: "Cotizaciones (CPQ)",
  ops_rondas: "Rondas",
  ops_inventario: "Inventario",
  portal_cliente: "Portal Cliente",
  payroll: "Payroll",
  finanzas: "Finanzas",
  ats: "ATS / Reclutamiento",
  face_id: "Face ID",
  ia_operacional: "IA Operacional",
  control_acceso: "Control de Acceso",
  fiscalizacion: "Fiscalización",
  control_nocturno: "Control Nocturno",
  white_label: "White-label",
  app_nativa: "App Nativa",
  psych: "Psicolaboral",
};

type PageProps = {
  searchParams: Promise<{ m?: string; from?: string }>;
};

export default async function ModuloNoDisponiblePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const moduleKey = typeof params.m === "string" ? params.m : "";
  const moduleLabel = MODULE_LABELS[moduleKey] ?? (moduleKey || "este módulo");

  return (
    <div className="ds-page-enter mx-auto flex min-h-[60dvh] w-full max-w-lg items-center px-4 py-10">
      <EmptyState
        icon={<Lock className="h-6 w-6" aria-hidden />}
        tone="warn"
        title={`${moduleLabel} no está en tu plan`}
        description={
          <>
            Este módulo no está incluido en el plan de tu empresa.
            Si lo necesitas, contacta a tu administrador para solicitar un upgrade.
          </>
        }
        action={
          <Link
            href="/hub"
            className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-medium text-primary-foreground"
          >
            Volver al Hub
          </Link>
        }
        secondary={
          <Link
            href="/opai/configuracion/mi-plan"
            className="inline-flex h-11 min-w-[44px] items-center justify-center px-3 text-[13px] font-medium text-ds-text-2 underline-offset-4 hover:underline"
          >
            Contactar al administrador
          </Link>
        }
      />
    </div>
  );
}
