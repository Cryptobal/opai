import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
import { prisma } from "@/lib/prisma";

export type DotacionPosition = {
  customName?: string | null;
  puestoTrabajo?: { name: string } | null;
  cargo?: { name: string } | null;
  rol?: { name: string } | null;
  weekdays: readonly string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  numPuestos: number;
  /** Nombre del servicio (CpqServiceGroup) que agrupa turnos en el tab Puestos. */
  serviceGroup?: { name: string; displayOrder?: number | null } | null;
};

export const EMPTY_DOTACION = "Sin puestos cotizados; completar cuando exista costeo.";

const DOTACION_POSITION_SELECT = {
  customName: true,
  weekdays: true,
  startTime: true,
  endTime: true,
  numGuards: true,
  numPuestos: true,
  puestoTrabajo: { select: { name: true } },
  cargo: { select: { name: true } },
  rol: { select: { name: true } },
  serviceGroup: { select: { name: true, displayOrder: true } },
} as const;

/** Misma fuente que el tab Puestos / costeo: CpqPosition (+ serviceGroup). */
export async function loadDotacionPositions(quoteId: string): Promise<DotacionPosition[]> {
  const rows = await prisma.cpqPosition.findMany({
    where: { quoteId },
    select: DOTACION_POSITION_SELECT,
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return [...rows].sort((a, b) => {
    const ao = a.serviceGroup?.displayOrder ?? 999;
    const bo = b.serviceGroup?.displayOrder ?? 999;
    if (ao !== bo) return ao - bo;
    const an = a.serviceGroup?.name ?? "";
    const bn = b.serviceGroup?.name ?? "";
    return an.localeCompare(bn);
  });
}

export function countDotacionGuards(positions: readonly DotacionPosition[]): number {
  return positions.reduce(
    (sum, position) => sum + Number(position.numGuards || 0) * Number(position.numPuestos || 1),
    0,
  );
}

export function hasRealDotacion(positions: readonly DotacionPosition[]): boolean {
  return positions.length > 0 && countDotacionGuards(positions) > 0;
}

export function isEmptyDotacionContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  return trimmed === EMPTY_DOTACION || trimmed.includes("Sin puestos cotizados");
}

function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "—";
}

function positionLabel(position: DotacionPosition, index: number): string {
  return (
    position.customName?.trim() ||
    position.puestoTrabajo?.name?.trim() ||
    `Puesto ${index + 1}`
  );
}

function positionRow(position: DotacionPosition, index: number): string {
  const puesto = positionLabel(position, index);
  const cargo = position.cargo?.name?.trim() || position.rol?.name?.trim() || "A definir";
  const schedule = `${formatWeekdaysShort(position.weekdays)} · ${position.startTime}–${position.endTime}`;
  const guards = Number(position.numGuards || 0) * Number(position.numPuestos || 1);

  return `| ${tableCell(puesto)} | ${tableCell(cargo)} | ${tableCell(schedule)} | ${guards} | ${position.numPuestos} |`;
}

/**
 * Redacta Dotación desde servicios → turnos (misma fuente del costeo / tab Puestos).
 * Agrupa por serviceGroup cuando existe; si no, tabla plana.
 */
export function buildDotacionContent(positions: readonly DotacionPosition[]): string {
  if (!hasRealDotacion(positions)) return EMPTY_DOTACION;

  const totalGuards = countDotacionGuards(positions);
  const tableHeader = [
    "| Puesto | Cargo | Cobertura | Guardias | Puestos |",
    "| --- | --- | --- | ---: | ---: |",
  ];

  const groups = new Map<string, { order: number; rows: DotacionPosition[] }>();
  const ungrouped: DotacionPosition[] = [];

  for (const position of positions) {
    const name = position.serviceGroup?.name?.trim();
    if (!name) {
      ungrouped.push(position);
      continue;
    }
    const current = groups.get(name) ?? {
      order: position.serviceGroup?.displayOrder ?? 999,
      rows: [],
    };
    current.rows.push(position);
    groups.set(name, current);
  }

  const blocks: string[] = ["Dotación considerada según el costeo vigente:", ""];
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]),
  );

  if (sortedGroups.length === 0) {
    blocks.push(
      ...tableHeader,
      ...positions.map((position, index) => positionRow(position, index)),
      "",
    );
  } else {
    for (const [serviceName, group] of sortedGroups) {
      const serviceGuards = countDotacionGuards(group.rows);
      blocks.push(
        `### ${serviceName}`,
        "",
        `Turnos: ${group.rows.length} · Dotación: ${serviceGuards} guardias`,
        "",
        ...tableHeader,
        ...group.rows.map((position, index) => positionRow(position, index)),
        "",
      );
    }
    if (ungrouped.length > 0) {
      blocks.push(
        "### Sin servicio agrupado",
        "",
        ...tableHeader,
        ...ungrouped.map((position, index) => positionRow(position, index)),
        "",
      );
    }
  }

  blocks.push(`**Dotación total:** ${totalGuards} guardias en ${positions.length} turno(s).`);
  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type DotacionInstallationBlock = {
  name: string;
  positions: readonly DotacionPosition[];
};

/**
 * Dotación multi-instalación: un bloque por sitio + total consolidado.
 * Si hay una sola instalación, delega a `buildDotacionContent`.
 */
export function buildDotacionContentForInstallations(
  installations: readonly DotacionInstallationBlock[],
): string {
  const withPositions = installations.filter((inst) => hasRealDotacion(inst.positions));
  if (withPositions.length === 0) return EMPTY_DOTACION;
  if (withPositions.length === 1) {
    return buildDotacionContent(withPositions[0]!.positions);
  }

  const blocks: string[] = ["Dotación considerada según el costeo vigente:", ""];
  let totalGuards = 0;
  let totalTurns = 0;

  for (const inst of withPositions) {
    const body = buildDotacionContent(inst.positions)
      .replace(/^Dotación considerada según el costeo vigente:\n*/i, "")
      .replace(/\n*\*\*Dotación total:\*\*[^\n]*$/i, "")
      .trim();
    const guards = countDotacionGuards(inst.positions);
    totalGuards += guards;
    totalTurns += inst.positions.length;
    blocks.push(
      `## ${inst.name.trim() || "Instalación"}`,
      "",
      body,
      "",
    );
  }

  blocks.push(
    `**Dotación total consolidada:** ${totalGuards} guardias en ${totalTurns} turno(s) · ${withPositions.length} instalaciones.`,
  );
  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
