import { formatWeekdaysShort } from "@/lib/cpq/weekdays";

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
};

const EMPTY_DOTACION = "Sin puestos cotizados; completar cuando exista costeo.";

function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "—";
}

export function buildDotacionContent(positions: readonly DotacionPosition[]): string {
  if (positions.length === 0) return EMPTY_DOTACION;

  const rows = positions.map((position, index) => {
    const puesto =
      position.customName?.trim() ||
      position.puestoTrabajo?.name?.trim() ||
      `Puesto ${index + 1}`;
    const cargo = position.cargo?.name?.trim() || position.rol?.name?.trim() || "A definir";
    const schedule = `${formatWeekdaysShort(position.weekdays)} · ${position.startTime}–${position.endTime}`;

    return `| ${tableCell(puesto)} | ${tableCell(cargo)} | ${tableCell(schedule)} | ${position.numGuards} | ${position.numPuestos} |`;
  });

  return [
    "Dotación considerada según el costeo vigente:",
    "",
    "| Puesto | Cargo | Cobertura | Guardias | Puestos |",
    "| --- | --- | --- | ---: | ---: |",
    ...rows,
  ].join("\n");
}
