/**
 * Resolutor puro de estado de celda y cabecera de slot en pauta mensual.
 *
 * Precedencia de celda: reemplazo > ausencia (trabajo/descanso) > planificado
 * (con F pre-fecha) > fantasma F/CI/CP/DES > PPC > descanso/vacío.
 *
 * `endDate` de asignaciones es inclusivo. Fechas como YYYY-MM-DD.
 */
import {
  isVigenteOn,
  overlapsRange,
  resolveVigente,
  type RangoVigencia,
} from "@/lib/ops/asignacion-vigencia";

export const ABSENCE_CELL_CODES = ["L", "V", "PCG", "PSG"] as const;
export type AbsenceCellCode = (typeof ABSENCE_CELL_CODES)[number];

export type PautaCellKind =
  | "replacement"
  | "absence_work"
  | "absence_rest"
  | "work"
  | "finiquito_pre"
  | "ghost_finiquito"
  | "ghost_traslado_instalacion"
  | "ghost_traslado_puesto"
  | "ghost_desasignado"
  | "ppc"
  | "rest"
  | "empty";

export type PautaCellCode =
  | "PR"
  | "L"
  | "V"
  | "PCG"
  | "PSG"
  | "T"
  | "F"
  | "CI"
  | "CP"
  | "DES"
  | "PPC"
  | "-"
  | "·";

export type GhostAsignacion = RangoVigencia & {
  installationId: string;
  installationName: string;
  puestoName: string;
};

export type PautaCellStateInput = {
  dateKey: string;
  shiftCode: string | null | undefined;
  plannedGuardiaId: string | null | undefined;
  plannedGuardia?: { terminatedAt?: string | Date | null } | null;
  replacementGuardiaId?: string | null;
  previousGuardiaId?: string | null;
  previousGuardiaName?: string | null;
  unassignedReason?: string | null;
  unassignedAt?: string | Date | null;
  absenceCode?: string | null;
  ghostAsignaciones?: GhostAsignacion[];
  currentInstallationId?: string | null;
  isRotativoRow?: boolean;
};

export type PautaCellState = {
  kind: PautaCellKind;
  code: PautaCellCode | string;
  isPpc: boolean;
  styleKey: string;
  tooltip: string;
};

export type SlotHeaderAsignacion = RangoVigencia & {
  guardiaId: string;
  name: string;
  terminatedAt?: string | Date | null;
  createdAt?: Date;
};

export type SlotHeaderGhost = {
  guardiaId: string;
  name: string;
  reason?: string | null;
};

export type SlotHeaderChip = {
  code: "hasta" | "desde" | "F" | "CI" | "DES" | "more";
  label: string;
  tooltip?: string;
};

export type SlotHeader = {
  guardiaId: string | null;
  name: string;
  tone: "default" | "warn" | "danger" | "info" | "muted";
  chips: SlotHeaderChip[];
  others: Array<{ name: string; startKey: string; endKey: string | null }>;
};

export function ymdToDdMm(ymd: string): string {
  const slice = ymd.slice(0, 10);
  const [, m, d] = slice.split("-");
  return `${d}/${m}`;
}

export function toYmd(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isWorkShift(shiftCode: string | null | undefined, isRotativoRow?: boolean): boolean {
  if (shiftCode === "T") return true;
  if (isRotativoRow && (shiftCode === "Td" || shiftCode === "Tn")) return true;
  return false;
}

function isAbsenceCode(code: string | null | undefined): code is AbsenceCellCode {
  return !!code && (ABSENCE_CELL_CODES as readonly string[]).includes(code);
}

function ghostDestination(
  input: PautaCellStateInput,
  date: Date,
): { kind: "CI" | "CP"; dest: GhostAsignacion } | null {
  const list = input.ghostAsignaciones ?? [];
  const vigentes = list.filter((a) => isVigenteOn(a, date));
  const originInst = input.currentInstallationId ?? null;
  const otherInst = vigentes.find((a) => a.installationId !== originInst);
  if (otherInst) return { kind: "CI", dest: otherInst };
  if (vigentes.length > 0) return { kind: "CP", dest: vigentes[0]! };
  return null;
}

function ghostTooltip(
  name: string,
  kind: "F" | "CI" | "CP" | "DES",
  dest: GhostAsignacion | null,
  unassignedAt: string | Date | null | undefined,
  unassignedReason: string | null | undefined,
): string {
  if (kind === "F") {
    const when = unassignedAt ? ymdToDdMm(toYmd(unassignedAt)) : "";
    return when ? `${name} — Finiquito ${when}` : `${name} — Finiquito`;
  }
  if (kind === "CI" && dest) {
    return `${name} — Cambio de instalación → ${dest.installationName} desde ${ymdToDdMm(toYmd(dest.startDate))}`;
  }
  if (kind === "CP" && dest) {
    return `${name} — Cambio de puesto → ${dest.puestoName} desde ${ymdToDdMm(toYmd(dest.startDate))}`;
  }
  const when = unassignedAt ? ymdToDdMm(toYmd(unassignedAt)) : "";
  const motivo = unassignedReason ? ` (${unassignedReason})` : "";
  return when ? `${name} — Desasignado ${when}${motivo}` : `${name} — Desasignado${motivo}`;
}

export function resolvePautaCellState(input: PautaCellStateInput): PautaCellState {
  const shift = input.shiftCode ?? "";
  const work = isWorkShift(shift, input.isRotativoRow);
  const date = parseYmd(input.dateKey);
  const name = input.previousGuardiaName?.trim() || "Guardia";

  if (input.replacementGuardiaId) {
    return {
      kind: "replacement",
      code: "PR",
      isPpc: false,
      styleKey: "PR",
      tooltip: "Reemplazo",
    };
  }

  if (input.absenceCode && isAbsenceCode(input.absenceCode)) {
    if (work) {
      return {
        kind: "absence_work",
        code: input.absenceCode,
        isPpc: true,
        styleKey: input.absenceCode,
        tooltip: `${input.absenceCode} — puesto por cubrir`,
      };
    }
    return {
      kind: "absence_rest",
      code: input.absenceCode,
      isPpc: false,
      styleKey: input.absenceCode,
      tooltip: `Día libre — ${input.absenceCode}`,
    };
  }

  if (input.plannedGuardiaId) {
    const terminatedAt = input.plannedGuardia?.terminatedAt
      ? toYmd(input.plannedGuardia.terminatedAt)
      : null;
    if (terminatedAt && input.dateKey <= terminatedAt && work) {
      return {
        kind: "finiquito_pre",
        code: shift || "T",
        isPpc: false,
        styleKey: "T",
        tooltip: `Finiquito ${ymdToDdMm(terminatedAt)}`,
      };
    }
    if (work) {
      return {
        kind: "work",
        code: shift || "T",
        isPpc: false,
        styleKey: "T",
        tooltip: "",
      };
    }
    if (shift === "-") {
      return { kind: "rest", code: "-", isPpc: false, styleKey: "-", tooltip: "Descanso" };
    }
    if (!shift) {
      return { kind: "empty", code: "·", isPpc: false, styleKey: "empty", tooltip: "" };
    }
    return {
      kind: "work",
      code: shift,
      isPpc: false,
      styleKey: shift,
      tooltip: "",
    };
  }

  if (input.previousGuardiaId) {
    const reason = (input.unassignedReason ?? "").toLowerCase();
    const dest = ghostDestination(input, date);
    let ghostKind: PautaCellKind = "ghost_desasignado";
    let code: PautaCellCode = "DES";
    if (reason === "finiquito") {
      ghostKind = "ghost_finiquito";
      code = "F";
    } else if (dest?.kind === "CI") {
      ghostKind = "ghost_traslado_instalacion";
      code = "CI";
    } else if (dest?.kind === "CP") {
      ghostKind = "ghost_traslado_puesto";
      code = "CP";
    }
    return {
      kind: ghostKind,
      code,
      isPpc: work,
      styleKey: code,
      tooltip: ghostTooltip(name, code, dest?.dest ?? null, input.unassignedAt, input.unassignedReason),
    };
  }

  if (work) {
    return {
      kind: "ppc",
      code: "PPC",
      isPpc: true,
      styleKey: "PPC",
      tooltip: "Puesto por cubrir (PPC)",
    };
  }
  if (shift === "-") {
    return { kind: "rest", code: "-", isPpc: false, styleKey: "-", tooltip: "Descanso" };
  }
  if (!shift) {
    return { kind: "empty", code: "·", isPpc: false, styleKey: "empty", tooltip: "Sin asignar" };
  }
  return {
    kind: "work",
    code: shift,
    isPpc: false,
    styleKey: shift,
    tooltip: "",
  };
}

export function resolveSlotHeader(params: {
  asignaciones: SlotHeaderAsignacion[];
  ghost: SlotHeaderGhost | null;
  monthStartKey: string;
  monthEndKey: string;
  todayKey: string;
}): SlotHeader | null {
  const { asignaciones, ghost, monthStartKey, monthEndKey, todayKey } = params;
  const monthStart = parseYmd(monthStartKey);
  const monthEnd = parseYmd(monthEndKey);
  const inMonth = asignaciones.filter((a) => overlapsRange(a, monthStart, monthEnd));

  const refKey =
    todayKey >= monthStartKey && todayKey <= monthEndKey ? todayKey : monthEndKey;
  const refDate = parseYmd(refKey);

  const vigente = resolveVigente(inMonth, refDate);
  const fallback = [...inMonth].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null;
  const primary = vigente ?? fallback;

  if (!primary && !ghost) return null;

  if (!primary && ghost) {
    const reason = (ghost.reason ?? "").toLowerCase();
    const chipCode: SlotHeaderChip["code"] =
      reason === "finiquito" ? "F" : reason === "reasignacion" ? "CI" : "DES";
    return {
      guardiaId: ghost.guardiaId,
      name: ghost.name,
      tone: "muted",
      chips: [{ code: chipCode, label: chipCode }],
      others: [],
    };
  }

  const chosen = primary!;
  const startKey = toYmd(chosen.startDate);
  const endKey = chosen.endDate ? toYmd(chosen.endDate) : null;
  const terminatedKey = chosen.terminatedAt ? toYmd(chosen.terminatedAt) : null;

  const chips: SlotHeaderChip[] = [];
  let tone: SlotHeader["tone"] = "default";

  if (terminatedKey) {
    chips.push({
      code: "F",
      label: endKey && endKey >= monthStartKey && endKey <= monthEndKey
        ? `F · hasta ${ymdToDdMm(endKey)}`
        : `F · hasta ${ymdToDdMm(terminatedKey)}`,
    });
    tone = "danger";
  } else if (endKey && endKey >= monthStartKey && endKey <= monthEndKey) {
    chips.push({ code: "hasta", label: `hasta ${ymdToDdMm(endKey)}` });
    tone = "warn";
  }

  if (startKey > monthStartKey) {
    chips.push({ code: "desde", label: `desde ${ymdToDdMm(startKey)}` });
    if (tone === "default") tone = "info";
  }

  const others = inMonth
    .filter((a) => a.guardiaId !== chosen.guardiaId || toYmd(a.startDate) !== startKey)
    .map((a) => ({
      name: a.name,
      startKey: toYmd(a.startDate),
      endKey: a.endDate ? toYmd(a.endDate) : null,
    }));

  if (others.length > 0) {
    chips.push({
      code: "more",
      label: `+${others.length}`,
      tooltip: others
        .map((o) => `${o.name} ${ymdToDdMm(o.startKey)}–${o.endKey ? ymdToDdMm(o.endKey) : "…"}`)
        .join(" · "),
    });
  }

  return {
    guardiaId: chosen.guardiaId,
    name: chosen.name,
    tone,
    chips,
    others,
  };
}

/** Nombre de fila para exports: `Nombre (hasta dd/mm)` cuando aplica. */
export function slotHeaderExportLabel(header: SlotHeader | null): string {
  if (!header) return "Sin asignar";
  const hasta = header.chips.find((c) => c.code === "hasta" || c.code === "F");
  if (hasta) return `${header.name} (${hasta.label})`;
  const desde = header.chips.find((c) => c.code === "desde");
  if (desde) return `${header.name} (${desde.label})`;
  return header.name;
}
