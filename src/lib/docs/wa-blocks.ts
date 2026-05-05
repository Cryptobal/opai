/**
 * WhatsApp Blocks — Helpers que construyen bloques de texto pre-formateados
 * en el estilo WhatsApp (asteriscos para negrita, guiones para listas).
 *
 * Estos bloques se exponen como tokens compuestos (blocks.*) para que las
 * plantillas DocTemplate los inserten como un único token sin tener que
 * implementar directivas iterativas.
 *
 * Patrón: cada función recibe los datos crudos y retorna un string ya formateado.
 * Si no hay datos, retorna string vacío para que la plantilla quede limpia.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";

const fmtClp = (n: number | null | undefined): string =>
  typeof n === "number" && n > 0
    ? `$${Math.round(n).toLocaleString("es-CL")}`
    : "—";

const fmtDateShort = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  try {
    return format(typeof d === "string" ? new Date(d) : d, "dd/MM/yyyy");
  } catch {
    return "—";
  }
};

const fmtDateLong = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  try {
    return format(typeof d === "string" ? new Date(d) : d, "d 'de' MMMM 'de' yyyy", { locale: es });
  } catch {
    return "—";
  }
};

// ─────────────────────────────────────────────────────────
// CRM · Adjudicación de negocio
// ─────────────────────────────────────────────────────────

export interface AdjudicacionDatosInput {
  dealTitle: string;
  accountName: string;
  stageName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  installationName: string | null;
  installationAddress: string | null;
  mapsLink: string | null;
  serviceStartDate: string | Date | null;
  quoteCode: string | null;
  opaiUrl: string | null;
}

export function buildAdjudicacionDatosBlock(input: AdjudicacionDatosInput): string {
  const lines: string[] = [];
  lines.push("*Datos del Negocio*");
  lines.push(`Negocio: ${input.dealTitle}`);
  lines.push(`Cliente: ${input.accountName}`);
  if (input.stageName) lines.push(`Etapa: ${input.stageName}`);
  lines.push("");
  lines.push("*Contacto Principal*");
  if (input.contactName) lines.push(`Nombre: ${input.contactName}`);
  if (input.contactEmail) lines.push(`Email: ${input.contactEmail}`);
  if (input.contactPhone) lines.push(`Celular: ${input.contactPhone}`);
  lines.push("");
  lines.push("*Instalación*");
  if (input.installationName) lines.push(`Nombre: ${input.installationName}`);
  if (input.installationAddress) lines.push(`Dirección: ${input.installationAddress}`);
  if (input.mapsLink) lines.push(`Google Maps: ${input.mapsLink}`);
  lines.push("");
  lines.push("*Inicio del Servicio*");
  lines.push(fmtDateLong(input.serviceStartDate));
  if (input.quoteCode) {
    lines.push("");
    lines.push(`*Cotización:* ${input.quoteCode}`);
  }
  return lines.join("\n");
}

export interface AdjudicacionDotacionPosition {
  cargoName: string;
  puestoName: string;
  customName?: string | null;
  daysLabel: string;
  startTime: string;
  endTime: string;
  numGuards: number;
  netSalary?: number | null;
}

export function buildAdjudicacionDotacionBlock(positions: AdjudicacionDotacionPosition[]): string {
  if (positions.length === 0) return "";
  const total = positions.reduce((s, p) => s + (p.numGuards || 0), 0);
  const lines: string[] = [];
  lines.push(`*Dotación de Personal (${total} guardia${total === 1 ? "" : "s"})*`);
  for (const p of positions) {
    lines.push("");
    lines.push(`• ${p.cargoName} — ${p.puestoName}`);
    if (p.customName) lines.push(`   Nombre: ${p.customName}`);
    lines.push(`   ${p.daysLabel} | ${p.startTime} - ${p.endTime}`);
    lines.push(`   Guardias: ${p.numGuards} | Líquido: ${fmtClp(p.netSalary)}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────
// CRM · Onboarding
// ─────────────────────────────────────────────────────────

export interface OnboardingDatosInput {
  accountName: string;
  installationName: string | null;
  stageName: string | null;
  serviceStartDate: string | Date | null;
  installationAddress: string | null;
  mapsLink: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export function buildOnboardingDatosBlock(input: OnboardingDatosInput): string {
  const lines: string[] = [];
  lines.push("*Datos del Negocio*");
  lines.push(`Cliente: ${input.accountName}`);
  if (input.installationName) lines.push(`Instalación: ${input.installationName}`);
  if (input.stageName) lines.push(`Etapa: ${input.stageName}`);
  lines.push("");
  lines.push("*Inicio del Servicio*");
  lines.push(fmtDateLong(input.serviceStartDate));
  lines.push("");
  lines.push("*Dirección*");
  if (input.installationAddress) lines.push(input.installationAddress);
  if (input.mapsLink) lines.push(`Google Maps: ${input.mapsLink}`);
  lines.push("");
  lines.push("*Contacto Principal*");
  if (input.contactName) lines.push(`Nombre: ${input.contactName}`);
  if (input.contactEmail) lines.push(`Email: ${input.contactEmail}`);
  if (input.contactPhone) lines.push(`Teléfono: ${input.contactPhone}`);
  return lines.join("\n");
}

export interface OnboardingTicket {
  title: string;
  teamLabel: string;
  priorityLabel: string;
  dueDate: Date | null;
}

export function buildOnboardingTicketsBlock(tickets: OnboardingTicket[]): string {
  if (tickets.length === 0) return "";
  const lines: string[] = [];
  lines.push(`*Pendientes (${tickets.length} ticket${tickets.length === 1 ? "" : "s"})*`);
  for (const t of tickets) {
    lines.push(`• ${t.title} — ${t.teamLabel} · ${t.priorityLabel} · vence ${fmtDateShort(t.dueDate)}`);
  }
  return lines.join("\n");
}

// Reutiliza el mismo formato de dotación que adjudicación
export const buildOnboardingDotacionBlock = buildAdjudicacionDotacionBlock;

// ─────────────────────────────────────────────────────────
// CPQ · Visita técnica al supervisor
// ─────────────────────────────────────────────────────────

export interface CpqVisitaPuesto {
  name: string;
  numGuards: number;
  startTime?: string | null;
  endTime?: string | null;
}

export function buildCpqVisitaPuestosBlock(puestos: CpqVisitaPuesto[]): string {
  if (puestos.length === 0) return "";
  const lines: string[] = [];
  lines.push("*Dotación solicitada:*");
  for (const p of puestos) {
    const horario = [p.startTime, p.endTime].filter(Boolean).join("–") || "";
    const detalle = `${p.name} — ${p.numGuards} guardia${p.numGuards !== 1 ? "s" : ""}${horario ? ` · ${horario}` : ""}`;
    lines.push(`- ${detalle}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────
// CPQ · Encabezado de propuesta enviada
// ─────────────────────────────────────────────────────────

export interface CpqProposalHeaderInput {
  quoteCode: string;
  manualRef?: string | null; // quote.name si existe
  accountName: string;
  installationName?: string | null;
}

export function buildCpqProposalHeaderBlock(input: CpqProposalHeaderInput): string {
  const lines: string[] = [`*Cotización ${input.quoteCode}*`];
  if (input.manualRef) {
    lines.push(`*Nombre / referencia:* ${input.manualRef}`);
  } else {
    lines.push(`*Cuenta:* ${input.accountName}`);
  }
  if (input.installationName) {
    lines.push(`*Instalación:* ${input.installationName}`);
  }
  return lines.join("\n");
}
