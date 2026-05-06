/**
 * Construye los BLOQUES de texto pre-formateados para el mensaje de onboarding.
 *
 * El mensaje final lo arma el endpoint /api/whatsapp/resolve-template usando
 * el slug `onboarding_summary` con estos bloques inyectados como blockTokens.
 *
 * Esta refactorización reemplaza la función monolítica `buildOnboardingWhatsAppMessage`
 * por bloques individuales que se inyectan en la plantilla del tenant. El tenant
 * puede editar el wrap-around (saludo, orden, despedida) sin tocar la lógica iterativa.
 */

import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
import {
  buildOnboardingDatosBlock,
  buildOnboardingDotacionBlock,
  buildOnboardingTicketsBlock,
  type OnboardingTicket,
} from "@/lib/docs/wa-blocks";
import type { OnboardingStepDraft, PreviewData } from "./types";

export type QuotePosition = {
  customName?: string | null;
  weekdays: string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  baseSalary?: number | null;
  netSalary?: number | null;
  puestoTrabajo?: { name: string } | null;
  cargo?: { name: string } | null;
};

export type CreatedTicketSummary = {
  id: string;
  title: string;
  team: string;
  priority: string;
  dueDate: Date | null;
};

const TEAM_LABEL: Record<string, string> = {
  ops: "Operaciones",
  finanzas: "Finanzas",
  inventario: "Inventario",
  rrhh: "RRHH",
  comercial: "Comercial",
  soporte: "Soporte",
};

const PRIO_LABEL: Record<string, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
  p4: "P4",
  p5: "P5",
};

export function buildOnboardingTicketsFromSteps(
  steps: OnboardingStepDraft[],
  serviceStartDate: string | null,
): CreatedTicketSummary[] {
  const start = serviceStartDate ? new Date(serviceStartDate) : null;
  return steps
    .filter((s) => s.applies)
    .map((s) => {
      const due =
        start && !Number.isNaN(start.getTime())
          ? new Date(start.getTime() + s.dueDateOffsetDays * 86_400_000)
          : null;
      return {
        id: s.key,
        title: s.title,
        team: s.assignedTeam,
        priority: s.priority,
        dueDate: due,
      } satisfies CreatedTicketSummary;
    });
}

/**
 * Construye los bloques pre-renderizados del mensaje de onboarding.
 * El mensaje final se ensambla en el endpoint resolve-template usando estos
 * bloques como `blockTokens`.
 */
export function buildOnboardingBlocks(args: {
  preview: PreviewData;
  serviceStartDate: string | null;
  tickets: CreatedTicketSummary[];
  positions: QuotePosition[];
}): {
  onboardingDatos: string;
  onboardingDotacion: string;
  onboardingTickets: string;
} {
  const { preview, serviceStartDate, tickets, positions } = args;

  const installationAddress =
    [
      preview.installation?.address,
      preview.installation?.commune,
      preview.installation?.city,
    ]
      .filter(Boolean)
      .join(", ") || null;
  const hasCoords =
    preview.installation &&
    typeof preview.installation.lat === "number" &&
    typeof preview.installation.lng === "number";
  const mapsLink = hasCoords
    ? `https://maps.google.com/?q=${preview.installation!.lat},${preview.installation!.lng}`
    : null;
  const contact = preview.primaryContact;
  const contactName = contact
    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || null
    : null;

  const onboardingDatos = buildOnboardingDatosBlock({
    accountName: preview.account?.name || "—",
    installationName: preview.installation?.name || null,
    stageName: preview.deal?.stageName || null,
    serviceStartDate,
    installationAddress,
    mapsLink,
    contactName,
    contactEmail: contact?.email || null,
    contactPhone: contact?.phone || null,
  });

  const onboardingDotacion = buildOnboardingDotacionBlock(
    positions.map((p) => ({
      cargoName: p.cargo?.name || "Guardia",
      puestoName: p.puestoTrabajo?.name || "Sin puesto",
      customName: p.customName,
      daysLabel: formatWeekdaysShort(p.weekdays),
      startTime: p.startTime,
      endTime: p.endTime,
      numGuards: p.numGuards,
      netSalary: p.netSalary,
    })),
  );

  const onboardingTickets = buildOnboardingTicketsBlock(
    tickets.map<OnboardingTicket>((t) => ({
      title: t.title,
      teamLabel: TEAM_LABEL[t.team] || t.team,
      priorityLabel: PRIO_LABEL[t.priority] || t.priority.toUpperCase(),
      dueDate: t.dueDate,
    })),
  );

  return { onboardingDatos, onboardingDotacion, onboardingTickets };
}
