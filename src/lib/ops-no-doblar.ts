/**
 * Restricción: ningún guardia (activo o turno extra) puede doblar.
 * No puede tener 2 turnos el mismo día: ni solapados ni consecutivos.
 * MASTER_SPEC: "No puede cubrir dos PO el mismo día. Descanso: bloquea doble asignación diaria."
 */

/** Parsea "HH:mm" o "H:mm" a minutos desde medianoche. 24:00 = 1440. */
function parseTimeToMinutes(t: string): number {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return Math.min(24 * 60, h * 60 + min);
}

/**
 * Convierte shiftStart/shiftEnd a intervalo [startMin, endMin] en minutos desde medianoche del día.
 * Si end < start (ej: 22:00-06:00), end se interpreta como día siguiente: endMin = 24*60 + end.
 */
function shiftToInterval(shiftStart: string, shiftEnd: string): { startMin: number; endMin: number } {
  const startMin = parseTimeToMinutes(shiftStart);
  let endMin = parseTimeToMinutes(shiftEnd);
  if (endMin <= startMin) {
    endMin += 24 * 60; // turno nocturno que cruza medianoche
  }
  return { startMin, endMin };
}

/**
 * Dos turnos están en conflicto si:
 * - Se solapan (overlap)
 * - Son consecutivos sin descanso (uno termina cuando empieza el otro)
 */
function intervalsConflict(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number }
): boolean {
  // Solapamiento: a.start < b.end && b.start < a.end
  if (a.startMin < b.endMin && b.startMin < a.endMin) return true;
  // Consecutivos: a.end == b.start o b.end == a.start (sin descanso)
  if (a.endMin === b.startMin || b.endMin === a.startMin) return true;
  return false;
}

export type ShiftInfo = {
  shiftStart: string;
  shiftEnd: string;
  installationName?: string;
  puestoName?: string;
};

/**
 * Verifica si asignar al guardia en el turno "nuevo" genera conflicto con "existentes".
 * Retorna el primer conflicto encontrado o null si no hay.
 */
export function checkNoDoblar(
  nuevo: ShiftInfo,
  existentes: ShiftInfo[]
): { conflict: true; message: string; withInstallation?: string; withPuesto?: string } | null {
  const nuevoInt = shiftToInterval(nuevo.shiftStart, nuevo.shiftEnd);
  for (const ex of existentes) {
    const exInt = shiftToInterval(ex.shiftStart, ex.shiftEnd);
    if (intervalsConflict(nuevoInt, exInt)) {
      const lugar = [ex.installationName, ex.puestoName].filter(Boolean).join(" · ") || "otro turno";
      return {
        conflict: true,
        message: `El guardia ya tiene un turno en ${lugar} el mismo día (solapado o consecutivo). No puede doblar.`,
        withInstallation: ex.installationName,
        withPuesto: ex.puestoName,
      };
    }
  }
  return null;
}
