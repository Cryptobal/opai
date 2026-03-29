import type { OpsAlertaCoberturaEstado } from "@prisma/client";

type Estado = OpsAlertaCoberturaEstado;

const TRANSICIONES_VALIDAS: Record<Estado, Estado[]> = {
  BORRADOR: ["ACTIVA", "CANCELADA"],
  ACTIVA: ["ACEPTADA", "CANCELADA", "EXPIRADA"],
  ACEPTADA: ["CONFIRMADA", "ACTIVA", "CANCELADA"], // ACTIVA = re-alerta
  CONFIRMADA: ["ASIGNADA_PAUTA"],
  ASIGNADA_PAUTA: [],
  CANCELADA: [],
  EXPIRADA: ["ACTIVA"], // Re-activar alerta expirada
};

export function puedeTransicionar(estadoActual: Estado, estadoNuevo: Estado): boolean {
  return TRANSICIONES_VALIDAS[estadoActual]?.includes(estadoNuevo) ?? false;
}

export function esEstadoTerminal(estado: Estado): boolean {
  return (["ASIGNADA_PAUTA", "CANCELADA"] as Estado[]).includes(estado);
}

export function esEstadoActivo(estado: Estado): boolean {
  return (["ACTIVA", "ACEPTADA"] as Estado[]).includes(estado);
}

export function validarTransicion(
  estadoActual: Estado,
  estadoNuevo: Estado,
): { valido: boolean; error?: string } {
  if (estadoActual === estadoNuevo) {
    return { valido: false, error: "La alerta ya está en este estado" };
  }
  if (!puedeTransicionar(estadoActual, estadoNuevo)) {
    return {
      valido: false,
      error: `No se puede pasar de ${estadoActual} a ${estadoNuevo}. Transiciones válidas: ${TRANSICIONES_VALIDAS[estadoActual]?.join(", ") || "ninguna (estado terminal)"}`,
    };
  }
  return { valido: true };
}
