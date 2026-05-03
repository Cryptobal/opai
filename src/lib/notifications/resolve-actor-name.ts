import { prisma } from "@/lib/prisma";

export type ActorType = "admin" | "guardia" | "cliente";

export interface ResolvedActor {
  id: string;
  name: string;
  type: ActorType;
}

/**
 * Resuelve un ID de actor a su nombre legible. El `actorId` puede ser:
 *  - Un `Admin.id` (UUID).
 *  - Un `OpsGuardia.id` (UUID) — caso típico de tickets desde Portal Guardia
 *    donde `reportedBy` se llena con el ID del guardia.
 *  - Un `CrmContact.id` (UUID) — caso de tickets desde Portal Cliente.
 *
 * Hace **una sola** búsqueda batch por tipo. Devuelve un Map<id, ResolvedActor>.
 * Los IDs no encontrados simplemente no aparecen en el Map (el caller decide
 * el fallback, ej. "Usuario").
 */
// UUID v1-v5 (incluye el formato "uuid_generate_v4" de Postgres).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveActorNames(
  tenantId: string,
  actorIds: string[],
): Promise<Map<string, ResolvedActor>> {
  const result = new Map<string, ResolvedActor>();
  const ids = [...new Set(actorIds.filter(Boolean))];
  if (ids.length === 0) return result;

  // OpsGuardia.id y CrmContact.id son columnas @db.Uuid en Postgres, por lo que
  // pasarles un id que no es UUID (ej. el cuid de un Admin) hace fallar el
  // query con "invalid input syntax for type uuid". Filtramos antes de
  // disparar las queries para evitar el 500.
  const uuidIds = ids.filter((id) => UUID_RE.test(id));

  const [admins, guardias, contacts] = await Promise.all([
    prisma.admin.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, name: true, email: true },
    }),
    prisma.opsGuardia.findMany({
      where: { id: { in: uuidIds }, tenantId },
      include: {
        persona: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.crmContact.findMany({
      where: { id: { in: uuidIds }, tenantId },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  for (const a of admins) {
    result.set(a.id, {
      id: a.id,
      name: a.name?.trim() || a.email || "Usuario",
      type: "admin",
    });
  }
  // Si un ID coincide en admin Y guardia (improbable pero posible si se reusan
  // UUIDs entre tablas), prevalece admin. Por eso el orden importa.
  for (const g of guardias) {
    if (result.has(g.id)) continue;
    const p = g.persona;
    const name = p ? `${p.firstName} ${p.lastName}`.trim() : null;
    result.set(g.id, {
      id: g.id,
      name: name || "Guardia",
      type: "guardia",
    });
  }
  for (const c of contacts) {
    if (result.has(c.id)) continue;
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    result.set(c.id, {
      id: c.id,
      name: name || c.email || "Contacto",
      type: "cliente",
    });
  }

  return result;
}
