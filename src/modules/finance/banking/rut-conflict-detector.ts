import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeRutForMatch } from "./auto-match-payment.service";

export type RutEntityKind = "client" | "guardia" | "supplier" | "factoring";

export interface RutOccupant {
  kind: RutEntityKind;
  entityId: string;
  entityName: string;
}

/**
 * Detecta todos los lugares donde un RUT está registrado en el tenant.
 * Útil para:
 *   - Validar al crear/editar una cuenta/proveedor/guardia.
 *   - Diagnóstico de duplicados (vista admin).
 *   - Mostrar warning en reconocimiento de RUT cuando hay ambigüedad.
 *
 * Acepta el RUT en cualquier formato (con/sin puntos/guion); internamente
 * normaliza.
 */
export async function findRutOccupants(
  tenantId: string,
  rawRut: string,
): Promise<RutOccupant[]> {
  const normalized = normalizeRutForMatch(rawRut);
  if (!normalized || normalized.length < 8) return [];

  // El volumen por tenant es bajo (<10k registros total) — filtrado en JS.
  const [accounts, guardias, suppliers, factoring] = await Promise.all([
    prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, name: true, rut: true },
    }),
    prisma.opsGuardia.findMany({
      where: { tenantId, persona: { rut: { not: null } } },
      select: {
        id: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
    }),
    prisma.financeSupplier.findMany({
      where: { tenantId },
      select: { id: true, name: true, rut: true },
    }),
    prisma.financeFactoringCompany.findMany({
      where: { tenantId },
      select: { id: true, razonSocial: true, rut: true },
    }),
  ]);

  const occupants: RutOccupant[] = [];

  for (const a of accounts) {
    if (a.rut && normalizeRutForMatch(a.rut) === normalized) {
      occupants.push({ kind: "client", entityId: a.id, entityName: a.name });
    }
  }
  for (const g of guardias) {
    const r = g.persona?.rut ?? null;
    if (r && normalizeRutForMatch(r) === normalized) {
      const fullName = `${g.persona.firstName ?? ""} ${g.persona.lastName ?? ""}`.trim();
      occupants.push({
        kind: "guardia",
        entityId: g.id,
        entityName: fullName || "Guardia sin nombre",
      });
    }
  }
  for (const s of suppliers) {
    if (s.rut && normalizeRutForMatch(s.rut) === normalized) {
      occupants.push({ kind: "supplier", entityId: s.id, entityName: s.name });
    }
  }
  for (const f of factoring) {
    if (f.rut && normalizeRutForMatch(f.rut) === normalized) {
      occupants.push({
        kind: "factoring",
        entityId: f.id,
        entityName: f.razonSocial,
      });
    }
  }

  return occupants;
}

/**
 * Lista todos los RUTs duplicados en el tenant (ya sea dentro de la misma
 * tabla o cross-tabla). Para vista de diagnóstico admin.
 */
export async function listDuplicateRuts(tenantId: string): Promise<
  Array<{
    rut: string;
    occupants: RutOccupant[];
  }>
> {
  const [accounts, guardias, suppliers, factoring] = await Promise.all([
    prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, name: true, rut: true },
    }),
    prisma.opsGuardia.findMany({
      where: { tenantId, persona: { rut: { not: null } } },
      select: {
        id: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
    }),
    prisma.financeSupplier.findMany({
      where: { tenantId },
      select: { id: true, name: true, rut: true },
    }),
    prisma.financeFactoringCompany.findMany({
      where: { tenantId },
      select: { id: true, razonSocial: true, rut: true },
    }),
  ]);

  const byRut = new Map<string, RutOccupant[]>();
  const push = (rut: string, occ: RutOccupant) => {
    const k = normalizeRutForMatch(rut);
    if (!k) return;
    const existing = byRut.get(k) ?? [];
    existing.push(occ);
    byRut.set(k, existing);
  };

  for (const a of accounts) {
    if (a.rut)
      push(a.rut, { kind: "client", entityId: a.id, entityName: a.name });
  }
  for (const g of guardias) {
    const r = g.persona?.rut ?? null;
    if (r) {
      const fullName = `${g.persona.firstName ?? ""} ${g.persona.lastName ?? ""}`.trim();
      push(r, {
        kind: "guardia",
        entityId: g.id,
        entityName: fullName || "Guardia",
      });
    }
  }
  for (const s of suppliers) {
    if (s.rut)
      push(s.rut, { kind: "supplier", entityId: s.id, entityName: s.name });
  }
  for (const f of factoring) {
    if (f.rut)
      push(f.rut, {
        kind: "factoring",
        entityId: f.id,
        entityName: f.razonSocial,
      });
  }

  return Array.from(byRut.entries())
    .filter(([, occs]) => occs.length > 1)
    .map(([rut, occupants]) => ({ rut, occupants }));
}
