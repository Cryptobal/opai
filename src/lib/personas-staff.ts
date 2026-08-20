/**
 * Clasificación HR de Personas: clase económica (caja / EERR) vs cargo interno.
 * Puro, sin prisma.
 */

export const PERSONA_LABOR_CLASSES = ["OPERATIVO", "ADMINISTRATIVO"] as const;
export type PersonaLaborClass = (typeof PERSONA_LABOR_CLASSES)[number];

export const STAFF_CARGOS = [
  "supervisor",
  "jefe",
  "gerente",
  "administrativo",
  "otro",
] as const;
export type StaffCargo = (typeof STAFF_CARGOS)[number];

export const LABOR_CLASS_LABELS: Record<PersonaLaborClass, string> = {
  OPERATIVO: "Guardia",
  ADMINISTRATIVO: "Administrativo",
};

export const STAFF_CARGO_LABELS: Record<StaffCargo, string> = {
  supervisor: "Supervisor",
  jefe: "Jefe",
  gerente: "Gerente",
  administrativo: "Administrativo",
  otro: "Otro",
};

export function isPersonaLaborClass(value: unknown): value is PersonaLaborClass {
  return value === "OPERATIVO" || value === "ADMINISTRATIVO";
}

export function isStaffCargo(value: unknown): value is StaffCargo {
  return STAFF_CARGOS.includes(value as StaffCargo);
}

export function staffCargoLabel(cargo: string | null | undefined): string {
  if (cargo && isStaffCargo(cargo)) return STAFF_CARGO_LABELS[cargo];
  return cargo?.trim() || "Sin cargo";
}

/** Costo de explotación (guardias) vs gasto de administración (equipo interno). */
export function laborClassIsCost(laborClass: PersonaLaborClass): boolean {
  return laborClass === "OPERATIVO";
}

export function laborClassLabel(laborClass: string | null | undefined): string {
  if (laborClass && isPersonaLaborClass(laborClass)) return LABOR_CLASS_LABELS[laborClass];
  return "Guardia";
}

export function normalizePersonNameKey(firstName: string, lastName: string): string {
  return `${lastName} ${firstName}`
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mismo apellido y nombres que se contienen (Carlos vs Carlos Cristobal). */
export function namesLikelySame(
  a: { firstName: string; lastName: string },
  b: { firstName: string; lastName: string },
): boolean {
  const lastA = normalizePersonNameKey("", a.lastName);
  const lastB = normalizePersonNameKey("", b.lastName);
  if (!lastA || lastA !== lastB) return false;
  const fA = normalizePersonNameKey(a.firstName, "");
  const fB = normalizePersonNameKey(b.firstName, "");
  if (!fA || !fB) return false;
  return fA === fB || fA.includes(fB) || fB.includes(fA);
}

/** Parte el nombre de un Admin (texto libre) en nombre / apellido. */
export function splitPersonName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/** Mapea `Admin.cargo` libre al catálogo de cargos internos. */
export function staffCargoFromAdminCargo(cargo: string | null | undefined): StaffCargo | null {
  if (!cargo?.trim()) return null;
  const n = cargo.trim().toLowerCase();
  if (isStaffCargo(n)) return n;
  if (n.includes("gerent")) return "gerente";
  if (n.includes("jefe")) return "jefe";
  if (n.includes("superv")) return "supervisor";
  if (n.includes("admin")) return "administrativo";
  return "otro";
}
