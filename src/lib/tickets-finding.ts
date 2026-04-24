import type { TicketFinding } from "@/lib/tickets";

/**
 * Prisma `include` shape that resolves the supervision finding context
 * needed to show the specific document / visit behind a ticket.
 *
 * Keep `take: 1` — the dedup model guarantees at most one canonical
 * finding per ticket (older duplicates carry status=superseded).
 */
export const ticketSupervisionFindingInclude = {
  supervisionFindings: {
    where: { status: { not: "superseded" } },
    take: 1,
    select: {
      id: true,
      category: true,
      severity: true,
      description: true,
      occurrenceCount: true,
      firstDetectedAt: true,
      lastDetectedAt: true,
      photoUrl: true,
      tipoDocId: true,
      tipoDoc: { select: { codigo: true, nombre: true, capa: true } },
      guardiaDocCode: true,
      guardId: true,
      guard: {
        select: {
          code: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      },
      lastDetectedVisitId: true,
      lastDetectedVisit: {
        select: {
          checkInAt: true,
          supervisorId: true,
          supervisor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  },
} as const;

export function mapTicketFinding(finding: any): TicketFinding | null {
  if (!finding) return null;
  const guardPersona = finding.guard?.persona;
  const guardName = guardPersona
    ? [guardPersona.firstName, guardPersona.lastName].filter(Boolean).join(" ").trim() || null
    : null;
  const supervisor = finding.lastDetectedVisit?.supervisor;
  const supervisorName = supervisor
    ? supervisor.name || supervisor.email || null
    : null;
  const checkInAt = finding.lastDetectedVisit?.checkInAt;
  return {
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    description: finding.description,
    occurrenceCount: finding.occurrenceCount ?? 1,
    firstDetectedAt: finding.firstDetectedAt instanceof Date
      ? finding.firstDetectedAt.toISOString()
      : finding.firstDetectedAt,
    lastDetectedAt: finding.lastDetectedAt instanceof Date
      ? finding.lastDetectedAt.toISOString()
      : finding.lastDetectedAt,
    photoUrl: finding.photoUrl ?? null,
    tipoDocId: finding.tipoDocId ?? null,
    tipoDocCodigo: finding.tipoDoc?.codigo ?? null,
    tipoDocNombre: finding.tipoDoc?.nombre ?? null,
    tipoDocCapa: finding.tipoDoc?.capa ?? null,
    guardiaDocCode: finding.guardiaDocCode ?? null,
    guardId: finding.guardId ?? null,
    guardName,
    guardCode: finding.guard?.code ?? null,
    lastVisitId: finding.lastDetectedVisitId ?? null,
    lastVisitCheckInAt: checkInAt instanceof Date
      ? checkInAt.toISOString()
      : (checkInAt ?? null),
    lastSupervisorId: supervisor?.id ?? null,
    lastSupervisorName: supervisorName,
  };
}

/**
 * Pick the canonical finding from a ticket row that has `supervisionFindings`
 * included via `ticketSupervisionFindingInclude`. Returns null for tickets
 * that do not originate from a supervision visit.
 */
export function pickTicketFinding(ticket: { supervisionFindings?: any[] | null }): TicketFinding | null {
  const first = ticket.supervisionFindings?.[0];
  return first ? mapTicketFinding(first) : null;
}
