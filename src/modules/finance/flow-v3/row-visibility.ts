/**
 * Reglas de visibilidad de filas en la planilla (v4.1).
 * Puro, sin prisma — testeable.
 */

export type VisibilityRow = {
  id: string;
  mapping: string;
  archivedAt: Date | string | null;
  recurringTemplateId?: string | null;
  /** Nombre canónico de fallback (Otros ingresos / Otros egresos). */
  isCanonicalFallback?: boolean;
};

export type ActiveTemplateRef = {
  id: string;
  isActive: boolean;
  /** YYYY-MM-DD o null = sin término. */
  endDateYmd: string | null;
};

/**
 * Normaliza para dedupe de nombres (case + NFD sin diacríticos).
 * No reemplaza `normalizeRowName` del matcher (que es case-only).
 */
export function normalizeNameForDedupe(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * ¿La fila debe incluirse en la matriz de la ventana?
 *
 * (a) mapping MANUAL / CATEGORY / SUPPLIER (filas de socios y egresos
 *     operativos siempre visibles). Las canónicas fallback
 *     ("Otros ingresos" / "Otros egresos") NO entran aquí: solo por (b).
 * (b) alguna celda ≠ 0 (plan, committed o real) en la ventana
 * (c) template vinculado activo (isActive y endDate nulo o ≥ inicio de ventana)
 *
 * ACCOUNT_INSTALLATION sin (b)/(c) se oculta (fantasmas de programaciones
 * pausadas/eliminadas o filas genéricas archivables).
 *
 * Archivadas: solo si tienen datos con week ≤ cutoff (regla previa).
 */
export function shouldIncludeFlowRow(opts: {
  row: VisibilityRow;
  windowStartYmd: string;
  hasDataInWindow: boolean;
  /** plan/committed/real ≠ 0 con week ≤ archivedCutoff (solo archivadas). */
  hasDataBeforeCutoff: boolean;
  archivedCutoffYmd: string | null;
  template: ActiveTemplateRef | null | undefined;
}): boolean {
  const { row } = opts;

  if (row.archivedAt) {
    return opts.hasDataBeforeCutoff;
  }

  // v4.3: fallback canónico solo por datos (b). Sin exención (a).
  if (row.isCanonicalFallback) {
    return opts.hasDataInWindow;
  }

  if (
    row.mapping === "MANUAL" ||
    row.mapping === "CATEGORY" ||
    row.mapping === "SUPPLIER"
  ) {
    return true;
  }

  if (opts.hasDataInWindow) {
    return true;
  }

  const tpl = opts.template;
  if (tpl && tpl.isActive) {
    if (tpl.endDateYmd == null || tpl.endDateYmd >= opts.windowStartYmd) {
      return true;
    }
  }

  return false;
}

/** Candidata libre para adoptar un template (misma cuenta, sin otro template). */
export type AdoptionCandidate = {
  id: string;
  crmAccountId: string | null;
  installationId: string | null;
  recurringTemplateId: string | null;
  name: string;
  createdAt: Date | string;
};

export type TemplateForAdoption = {
  id: string;
  crmAccountId: string;
  installationId: string | null;
  name: string;
};

/**
 * Prioridad de adopción (misma cuenta, fila libre):
 * 1. cuenta+instalación exacta sin template
 * 2. genérica de cuenta sin template
 * 3. mismo nombre normalizado (NFD) y misma cuenta sin template
 */
export function pickAdoptionCandidate(
  template: TemplateForAdoption,
  freeRows: AdoptionCandidate[],
): AdoptionCandidate | null {
  const sameAccount = freeRows.filter(
    (r) =>
      r.crmAccountId === template.crmAccountId &&
      r.recurringTemplateId == null,
  );
  if (sameAccount.length === 0) return null;

  const exactInst = sameAccount.find(
    (r) =>
      template.installationId != null &&
      r.installationId === template.installationId,
  );
  if (exactInst) return exactInst;

  const generic = sameAccount.find((r) => r.installationId == null);
  if (generic) return generic;

  const want = normalizeNameForDedupe(template.name);
  const byName = sameAccount.find((r) => normalizeNameForDedupe(r.name) === want);
  return byName ?? null;
}

/**
 * ¿Archivar sobrante ACCOUNT_INSTALLATION sin template activo?
 * - Sin plan propio → archivable (DTEs caen en Otros ingresos / filas de template).
 * - Con plan ≠ 0 → conservar (datos propios).
 */
export function shouldArchiveSurplusAccountRow(opts: {
  hasPlanData: boolean;
  /** Template activo existente al que apunta recurringTemplateId. */
  linkedActiveTemplate: boolean;
}): boolean {
  if (opts.linkedActiveTemplate) return false;
  if (opts.hasPlanData) return false;
  return true;
}

/**
 * Entre duplicados exactos (mismo nombre NFD + misma cuenta), cuál conservar.
 * Prefiere: con template > con plan > más antigua.
 */
export function pickDuplicateKeeper<
  T extends {
    id: string;
    recurringTemplateId: string | null;
    hasPlanData: boolean;
    createdAt: Date | string;
  },
>(dupes: T[]): T {
  return [...dupes].sort((a, b) => {
    const at = a.recurringTemplateId ? 1 : 0;
    const bt = b.recurringTemplateId ? 1 : 0;
    if (at !== bt) return bt - at;
    if (a.hasPlanData !== b.hasPlanData) return a.hasPlanData ? -1 : 1;
    const ac = new Date(a.createdAt).getTime();
    const bc = new Date(b.createdAt).getTime();
    return ac - bc;
  })[0]!;
}
