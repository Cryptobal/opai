/**
 * Aplica descuentos paramétricos (TE → líquido/Previred) sobre hitos de caja.
 * Puro: el match es key + dateYmd + laborClass OPERATIVO.
 * No toca hitos ADMINISTRATIVO. Si el split no existe, cae al hito sin clase
 * o al padre SUELDO/PREVIRED de esa fecha.
 */
export type PayrollPatchTarget = {
  key: string;
  dateYmd: string;
  amountClp: number;
  label?: string;
  metaNote?: string;
  laborClass?: "OPERATIVO" | "ADMINISTRATIVO" | null;
};

export type PayrollPatchInput = {
  key: string;
  dateYmd: string;
  amountClp: number;
  label?: string;
  metaNote?: string;
};

const PARENT_FALLBACK: Record<string, string> = {
  liquido: "SUELDO",
  previred: "PREVIRED",
};

function isOperativeHit(m: PayrollPatchTarget): boolean {
  return (m.laborClass ?? "OPERATIVO") === "OPERATIVO";
}

export function applyPayrollPatchesToMilestones<T extends PayrollPatchTarget>(
  milestones: T[],
  patches: PayrollPatchInput[],
): T[] {
  if (patches.length === 0) return milestones;
  const next = milestones.map((m) => ({ ...m }));

  for (const patch of patches) {
    let idx = next.findIndex(
      (m) => m.key === patch.key && m.dateYmd === patch.dateYmd && isOperativeHit(m),
    );

    if (idx < 0) {
      const parentKey = PARENT_FALLBACK[patch.key];
      if (parentKey) {
        idx = next.findIndex(
          (m) =>
            (m.key === parentKey || m.key === patch.key) &&
            m.dateYmd === patch.dateYmd &&
            m.laborClass !== "ADMINISTRATIVO",
        );
      }
    }

    if (idx < 0) continue;
    const prev = next[idx];
    if (prev.laborClass === "ADMINISTRATIVO") continue;
    const metaNote = [prev.metaNote, patch.metaNote].filter(Boolean).join(" · ") || undefined;
    next[idx] = {
      ...prev,
      amountClp: patch.amountClp,
      label: patch.label ?? prev.label,
      metaNote,
    };
  }

  return next;
}
