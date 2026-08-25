/**
 * Aplica descuentos paramétricos (TE / quincena → líquido/Previred) sobre
 * hitos de caja. Puro.
 *
 * Por defecto el parche pisa el hito OPERATIVO (o sin clase / padre
 * SUELDO/PREVIRED). Con `laborClass: "ADMINISTRATIVO"` pisa solo el admin.
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
  laborClass?: "OPERATIVO" | "ADMINISTRATIVO";
};

const PARENT_FALLBACK: Record<string, string> = {
  liquido: "SUELDO",
  previred: "PREVIRED",
};

function matchesClass(
  m: PayrollPatchTarget,
  wantAdmin: boolean,
): boolean {
  if (wantAdmin) return m.laborClass === "ADMINISTRATIVO";
  return (m.laborClass ?? "OPERATIVO") === "OPERATIVO";
}

export function applyPayrollPatchesToMilestones<T extends PayrollPatchTarget>(
  milestones: T[],
  patches: PayrollPatchInput[],
): T[] {
  if (patches.length === 0) return milestones;
  const next = milestones.map((m) => ({ ...m }));

  for (const patch of patches) {
    const wantAdmin = patch.laborClass === "ADMINISTRATIVO";
    let idx = next.findIndex(
      (m) =>
        m.key === patch.key &&
        m.dateYmd === patch.dateYmd &&
        matchesClass(m, wantAdmin),
    );

    if (idx < 0) {
      const parentKey = PARENT_FALLBACK[patch.key];
      if (parentKey) {
        idx = next.findIndex(
          (m) =>
            (m.key === parentKey || m.key === patch.key) &&
            m.dateYmd === patch.dateYmd &&
            matchesClass(m, wantAdmin),
        );
      }
    }

    if (idx < 0) continue;
    const prev = next[idx];
    if (wantAdmin && prev.laborClass !== "ADMINISTRATIVO") continue;
    if (!wantAdmin && prev.laborClass === "ADMINISTRATIVO") continue;
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
