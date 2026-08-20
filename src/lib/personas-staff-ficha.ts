/**
 * Matching de fichas HR: una persona, un contrato. Puro, sin prisma.
 */
import { cleanRut } from "@/lib/chile-rut";
import { namesLikelySame } from "@/lib/personas-staff";

export type FichaLookup = {
  personaId?: string | null;
  adminId?: string | null;
  rut?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type FichaRow = {
  id: string;
  firstName: string;
  lastName: string;
  rut: string | null;
  email: string | null;
  adminId: string | null;
  laborClass: string;
  salaryStructureId: string | null;
  guardia: { id: string } | null;
};

export function rutKey(rut: string | null | undefined): string | null {
  if (!rut) return null;
  const k = cleanRut(rut);
  return k.length >= 2 ? k : null;
}

export function emailsLikelySame(a?: string | null, b?: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function fichaMatchesLookup(row: FichaRow, q: FichaLookup): boolean {
  if (q.personaId && row.id === q.personaId) return true;
  if (q.adminId && row.adminId === q.adminId) return true;
  const qRut = rutKey(q.rut);
  if (qRut && rutKey(row.rut) === qRut) return true;
  if (emailsLikelySame(q.email, row.email)) return true;
  if (q.firstName && q.lastName && namesLikelySame(
    { firstName: q.firstName, lastName: q.lastName },
    { firstName: row.firstName, lastName: row.lastName },
  )) {
    return true;
  }
  return false;
}

function scoreKeep(row: FichaRow): number {
  let score = 0;
  if (row.guardia) score += 100;
  if (row.rut) score += 20;
  if (row.laborClass === "OPERATIVO") score += 10;
  if (row.adminId) score += 5;
  if (row.salaryStructureId) score += 2;
  return score;
}

/** Conserva la ficha con guardia (360); el resto son huérfanas a fusionar. */
export function decideStaffMerge(matches: FichaRow[]): {
  keep: FichaRow;
  orphans: FichaRow[];
} | null {
  if (matches.length === 0) return null;
  const keep = [...matches].sort((a, b) => scoreKeep(b) - scoreKeep(a))[0]!;
  return { keep, orphans: matches.filter((m) => m.id !== keep.id) };
}

/** Administrativo no entra al picker de pauta/PPC de terreno. */
export const FIELD_PAUTA_PERSONA_WHERE = {
  laborClass: { not: "ADMINISTRATIVO" },
} as const;
