/**
 * Puente puestos-del-lead: convierte un puesto de la dotación (borrador que el correo
 * o el cotizador guardan en `metadata.installationsDraft[].dotacion`) a una posición del
 * editor CPQ del lead (`cpqConfigs[].positions`).
 *
 * El editor de puestos del detalle del lead lee `positions`, no `dotacion`. Sin este
 * puente los puestos definidos desde el correo quedaban invisibles y había que
 * recrearlos a mano. Mantener este mapeo aislado permite testearlo sin montar el
 * componente y evita perder campos (observaciones del turno, agrupación de servicio…).
 */
import type { LeadPositionItem } from "@/components/crm/LeadInstallationCpq";

/** Forma mínima de un ítem de dotación necesaria para construir una posición. */
export type DotacionForPosition = {
  puestoTrabajoId?: string;
  puesto: string;
  customName?: string;
  cargoId?: string;
  rolId?: string;
  baseSalary?: number;
  shiftType?: "day" | "night";
  cantidad: number;
  numPuestos?: number;
  horaInicio: string;
  horaFin: string;
  dias: string[];
  /** Observaciones del turno (funciones, protocolos). Del correo → PDF/portal. */
  description?: string | null;
  serviceGroupKey?: string;
  serviceGroupName?: string;
  serviceGroupPattern?: LeadPositionItem["serviceGroupPattern"];
  serviceGroupOrder?: number;
  serviceGroupIcon?: string;
};

export function dotacionToPosition(d: DotacionForPosition): LeadPositionItem {
  return {
    puestoTrabajoId: d.puestoTrabajoId,
    puesto: d.puesto,
    customName: d.customName,
    description: d.description ?? null,
    cargoId: d.cargoId,
    rolId: d.rolId,
    baseSalary: d.baseSalary,
    shiftType: d.shiftType,
    cantidad: d.cantidad,
    numPuestos: d.numPuestos,
    horaInicio: d.horaInicio,
    horaFin: d.horaFin,
    dias: [...d.dias],
    serviceGroupKey: d.serviceGroupKey,
    serviceGroupName: d.serviceGroupName,
    serviceGroupPattern: d.serviceGroupPattern,
    serviceGroupOrder: d.serviceGroupOrder,
    serviceGroupIcon: d.serviceGroupIcon,
  };
}
