/**
 * Construye el mensaje de WhatsApp con el resumen del onboarding recién creado.
 *
 * Se invoca después de POST /api/onboarding/start, una vez que ya conocemos
 * los tickets generados. El mensaje sigue el estilo "negocio adjudicado" pero
 * orientado al equipo operativo: pendientes (tickets), puestos/turnos/horarios,
 * sueldos líquidos, dirección con Google Maps y datos del cliente.
 */

import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
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

const fmtDate = (d: Date | null): string =>
  d
    ? d.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

const fmtMoney = (n: number | null | undefined): string =>
  typeof n === "number" && n > 0
    ? `$${Math.round(n).toLocaleString("es-CL")}`
    : "—";

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

export function buildOnboardingWhatsAppMessage(args: {
  preview: PreviewData;
  serviceStartDate: string | null;
  tickets: CreatedTicketSummary[];
  positions: QuotePosition[];
  dealUrl: string;
  ticketsUrl?: string;
}): string {
  const { preview, serviceStartDate, tickets, positions, dealUrl, ticketsUrl } =
    args;

  const lines: string[] = [];
  const account = preview.account?.name || "—";
  const installName = preview.installation?.name || "—";
  const installAddress =
    [
      preview.installation?.address,
      preview.installation?.commune,
      preview.installation?.city,
    ]
      .filter(Boolean)
      .join(", ") || "—";
  const hasCoords =
    preview.installation &&
    typeof preview.installation.lat === "number" &&
    typeof preview.installation.lng === "number";
  const mapsLink = hasCoords
    ? `https://maps.google.com/?q=${preview.installation!.lat},${preview.installation!.lng}`
    : null;
  const startDateText = serviceStartDate
    ? new Date(serviceStartDate).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";
  const totalGuards = positions.reduce((sum, p) => sum + (p.numGuards || 0), 0);
  const contact = preview.primaryContact;
  const contactName = contact
    ? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "—"
    : "—";

  lines.push("*ONBOARDING DEL CLIENTE*");
  lines.push("");
  lines.push("*Datos del Negocio*");
  lines.push(`Cliente: ${account}`);
  lines.push(`Instalación: ${installName}`);
  if (preview.deal?.stageName) lines.push(`Etapa: ${preview.deal.stageName}`);
  lines.push("");

  lines.push("*Inicio del Servicio*");
  lines.push(startDateText);
  lines.push("");

  lines.push("*Dirección*");
  lines.push(installAddress);
  if (mapsLink) {
    lines.push(`Google Maps: ${mapsLink}`);
  }
  lines.push("");

  lines.push("*Contacto Principal*");
  lines.push(`Nombre: ${contactName}`);
  if (contact?.email) lines.push(`Email: ${contact.email}`);
  if (contact?.phone) lines.push(`Teléfono: ${contact.phone}`);
  lines.push("");

  if (positions.length > 0) {
    lines.push(`*Dotación (${totalGuards} guardia${totalGuards === 1 ? "" : "s"})*`);
    for (const p of positions) {
      const cargoName = p.cargo?.name || "Guardia";
      const puestoName = p.puestoTrabajo?.name || "Sin puesto";
      const days = formatWeekdaysShort(p.weekdays);
      lines.push("");
      lines.push(`• ${cargoName} — ${puestoName}`);
      if (p.customName) lines.push(`   Nombre: ${p.customName}`);
      lines.push(`   ${days} | ${p.startTime} - ${p.endTime}`);
      lines.push(
        `   ${p.numGuards} guardia${p.numGuards === 1 ? "" : "s"} | Líquido: ${fmtMoney(
          p.netSalary,
        )}`,
      );
    }
    lines.push("");
  }

  if (tickets.length > 0) {
    lines.push(`*Pendientes (${tickets.length} ticket${tickets.length === 1 ? "" : "s"})*`);
    for (const t of tickets) {
      const team = TEAM_LABEL[t.team] || t.team;
      const prio = PRIO_LABEL[t.priority] || t.priority.toUpperCase();
      lines.push(
        `• ${t.title} — ${team} · ${prio} · vence ${fmtDate(t.dueDate)}`,
      );
    }
    lines.push("");
  }

  if (ticketsUrl) {
    lines.push("*Ver tickets*");
    lines.push(ticketsUrl);
    lines.push("");
  }

  lines.push("*Ver negocio en OPAI*");
  lines.push(dealUrl);
  lines.push("");
  lines.push("---");
  lines.push("Mensaje generado automáticamente desde OPAI");

  return lines.join("\n");
}
