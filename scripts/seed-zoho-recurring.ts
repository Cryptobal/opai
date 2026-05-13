/**
 * Carga las plantillas de facturación recurrente desde el export de Zoho Books
 * de Gard Security. Idempotente por (tenantId + name).
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/seed-zoho-recurring.ts          # dry-run
 *   DATABASE_URL=... npx tsx scripts/seed-zoho-recurring.ts --apply  # ejecuta
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_SLUG = "gard";
const CREATED_BY_EMAIL = "carlos.irigoyen@gmail.com";

type Tpl = {
  name: string;
  /** "UF" o "CLP" */
  currency: "UF" | "CLP";
  /** Monto en UF (si currency=UF) — el cron lo convierte a CLP usando UF del día (LAST_DAY_PREV_MONTH). */
  unitPriceUf?: number;
  /** Monto en CLP (si currency=CLP). */
  unitPrice?: number;
  itemDescription: string;
  /** Día del mes en que se factura. */
  dayOfMonth: number;
  /** Match con CrmAccount: buscar por RUT (preferido) o por nombre exacto. */
  crmRut?: string;
  crmName?: string;
  /** Datos del receptor del CSV. */
  receiverRut: string;
  receiverName: string;
  receiverEmail?: string;
  startDate: string;
  notes?: string;
};

const TEMPLATES: Tpl[] = [
  // ── 20 en UF ──
  { name: "Transmat 80%", currency: "UF", unitPriceUf: 114, itemDescription: "Servicio de Seguridad — 80% del contrato (142 UF total)", dayOfMonth: 1, crmRut: "76270521-4", receiverRut: "76270521-4", receiverName: "Transmat", startDate: "2024-10-01" },
  { name: "Proforma Transmat 20%", currency: "UF", unitPriceUf: 28, itemDescription: "Servicio de Seguridad — 20% del contrato (142 UF total)", dayOfMonth: 20, crmRut: "76270521-4", receiverRut: "76270521-4", receiverName: "Transmat", startDate: "2024-10-20" },
  { name: "GL Events - Metropolitan", currency: "UF", unitPriceUf: 106, itemDescription: "Servicio de Seguridad — Metropolitan", dayOfMonth: 20, crmRut: "76096284-8", receiverRut: "76096284-8", receiverName: "GL Events", startDate: "2025-03-20" },
  { name: "Distrito los Trapenses", currency: "UF", unitPriceUf: 57, itemDescription: "Servicio de Seguridad — Distrito Los Trapenses", dayOfMonth: 20, crmRut: "77009086-5", receiverRut: "77009086-5", receiverName: "Distrito Los Trapenses", startDate: "2025-04-20" },
  { name: "Newtree", currency: "UF", unitPriceUf: 55, itemDescription: "Servicio de Seguridad — Newtree", dayOfMonth: 20, crmRut: "77873029-4", receiverRut: "77873029-4", receiverName: "Newtree", startDate: "2025-04-20" },
  { name: "Bodegas Santa Amalia", currency: "UF", unitPriceUf: 171, itemDescription: "Servicio de Seguridad — Bodegas Santa Amalia", dayOfMonth: 20, crmRut: "79513230-9", receiverRut: "79513230-9", receiverName: "Bodega Santa Amalia", startDate: "2025-06-20" },
  { name: "Pine", currency: "UF", unitPriceUf: 167, itemDescription: "Servicio de Seguridad — Pine", dayOfMonth: 20, crmRut: "76530382-6", receiverRut: "76530382-6", receiverName: "Pine", startDate: "2025-08-20", notes: "Banco Santander | Gard SpA | 77.840.623-3 | Cta Cte 94541158 | administracion@gard.cl" },
  { name: "SCRB - San Bernardo", currency: "UF", unitPriceUf: 110, itemDescription: "Servicios de Seguridad Privada — Obra San Bernardo", dayOfMonth: 20, crmRut: "78985840-3", receiverRut: "78985840-3", receiverName: "SCRB", startDate: "2025-10-20" },
  { name: "CIMS - La Reina", currency: "UF", unitPriceUf: 103, itemDescription: "Servicio de Seguridad — La Reina", dayOfMonth: 20, crmRut: "76090823-1", receiverRut: "76090823-1", receiverName: "CIMS", receiverEmail: "76090823-1@prd.inbox.febos.cl", startDate: "2025-10-20" },
  { name: "International Paper - Graneros", currency: "UF", unitPriceUf: 435, itemDescription: "Servicio de Seguridad — Graneros", dayOfMonth: 20, crmRut: "96584300-0", receiverRut: "96584300-0", receiverName: "International Paper", startDate: "2025-10-20" },
  { name: "International Paper - Requinoa", currency: "UF", unitPriceUf: 102, itemDescription: "Servicio de Seguridad — Requinoa", dayOfMonth: 20, crmRut: "96584300-0", receiverRut: "96584300-0", receiverName: "International Paper", startDate: "2025-10-20" },
  { name: "Berlintex", currency: "UF", unitPriceUf: 255.3, itemDescription: "Servicio de Seguridad — Berlintex (255,3 UF mensual)", dayOfMonth: 20, crmRut: "76600643-4", receiverRut: "76600643-4", receiverName: "Berlintex", startDate: "2026-01-20" },
  { name: "East West", currency: "UF", unitPriceUf: 114, itemDescription: "Servicio de Seguridad — East West (114 UF mensual)", dayOfMonth: 20, crmRut: "76600653-1", receiverRut: "76600653-1", receiverName: "East West", startDate: "2026-01-20" },
  { name: "Fapama Reñaca", currency: "UF", unitPriceUf: 71, itemDescription: "Servicio de Seguridad — Fapama Reñaca (1 puesto 12h noche L-D + 12h sab/dom/festivos)", dayOfMonth: 1, crmRut: "77956052-K", receiverRut: "77956052-K", receiverName: "Fapama", startDate: "2026-02-01" },
  { name: "Las Lengas", currency: "UF", unitPriceUf: 73, itemDescription: "Servicio de Seguridad — Las Lengas", dayOfMonth: 20, crmRut: "76302574-8", receiverRut: "76302574-8", receiverName: "Constructora Las Lengas", receiverEmail: "recepcion_76302574-8@unysoftdte.cl", startDate: "2026-02-20" },
  { name: "Fapama Quinta Normal", currency: "UF", unitPriceUf: 151.59, itemDescription: "Servicio de Seguridad — Fapama Quinta Normal (2 puestos 12h noche L-D + 12h sab/dom/festivos)", dayOfMonth: 1, crmRut: "77956052-K", receiverRut: "77956052-K", receiverName: "Fapama", startDate: "2026-04-01" },
  { name: "Ametel Algarrobo", currency: "UF", unitPriceUf: 107, itemDescription: "Servicio de Seguridad — Ametel Algarrobo", dayOfMonth: 1, crmRut: "59273570-9", receiverRut: "59273570-9", receiverName: "Ametel", startDate: "2026-04-01" },
  { name: "MAF", currency: "UF", unitPriceUf: 77.13, itemDescription: "Servicio de Seguridad — MAF (77,13 UF mensual)", dayOfMonth: 20, crmRut: "83415700-4", crmName: "MAF Chile", receiverRut: "83415700-4", receiverName: "MAF Chile", startDate: "2026-04-20" },
  { name: "Santa Hilda", currency: "UF", unitPriceUf: 76.91, itemDescription: "Servicio de Seguridad — Santa Hilda (76,91 UF mensual)", dayOfMonth: 20, crmRut: "79932460-1", receiverRut: "79932460-1", receiverName: "Santa Hilda", startDate: "2026-04-20" },
  { name: "Villa Alemana (Ametel)", currency: "UF", unitPriceUf: 117.94, itemDescription: "Servicio de Seguridad — Villa Alemana", dayOfMonth: 1, crmRut: "59273570-9", receiverRut: "59273570-9", receiverName: "Ametel", startDate: "2026-06-01" },
  // ── 5 en CLP ──
  { name: "Condominio La Florida", currency: "CLP", unitPrice: 3700000, itemDescription: "Servicios de Seguridad — Condominio La Florida", dayOfMonth: 20, crmRut: "65136824-3", receiverRut: "65136824-3", receiverName: "Condominio La Florida", startDate: "2024-06-20" },
  { name: "Proforma El Bosque Mes", currency: "CLP", unitPrice: 6380000, itemDescription: "Servicio de Seguridad — El Bosque", dayOfMonth: 20, crmRut: "91337000-7", receiverRut: "91337000-7", receiverName: "Polpaico", receiverEmail: "recepciondte_polpaico@polpaico.cl", startDate: "2024-09-20" },
  { name: "Proforma Mejillones Mes", currency: "CLP", unitPrice: 5796000, itemDescription: "Servicio de Seguridad — Mejillones", dayOfMonth: 20, crmRut: "91337000-7", receiverRut: "91337000-7", receiverName: "Polpaico", startDate: "2025-01-20" },
  { name: "Proforma Quilicura Mes", currency: "CLP", unitPrice: 7944039, itemDescription: "Servicio de Seguridad — Quilicura", dayOfMonth: 20, crmRut: "91337000-7", receiverRut: "91337000-7", receiverName: "Polpaico", receiverEmail: "recepciondte_polpaico@polpaico.cl", startDate: "2025-02-20" },
  { name: "Polpaico Coronel", currency: "CLP", unitPrice: 7750000, itemDescription: "Servicio de Seguridad — Coronel", dayOfMonth: 20, crmRut: "91337000-7", receiverRut: "91337000-7", receiverName: "Polpaico", startDate: "2025-08-20" },
  { name: "Embajada Brasil", currency: "CLP", unitPrice: 19638586, itemDescription: "Servicio de Seguridad — Embajada de Brasil", dayOfMonth: 20, crmRut: "69900700-5", receiverRut: "69900700-5", receiverName: "Embajada Brasil", startDate: "2025-04-20" },
];

/** Calcula nextRunAt para frecuencia mensual con dayOfMonth, desde una fecha base. */
function computeNextRun(startDate: Date, dayOfMonth: number, today: Date): Date {
  // Para plantillas pre-existentes en Zoho, el "próximo run" es el día N del mes siguiente o el de hoy.
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let candidate = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), dayOfMonth));
  if (candidate <= t) {
    candidate = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, dayOfMonth));
  }
  // Si el dayOfMonth desbordó el mes (ej. 31 en feb), JS lo normaliza igual; aceptamos.
  if (candidate < startDate) return startDate;
  return candidate;
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  console.log(APPLY ? "▶ MODO APPLY — los cambios SE persisten\n" : "▶ MODO DRY-RUN (usar --apply para persistir)\n");

  const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant ${TENANT_SLUG} no encontrado`);

  const admin = await prisma.admin.findFirst({
    where: { email: CREATED_BY_EMAIL, tenantId: tenant.id },
    select: { id: true },
  });
  if (!admin) throw new Error(`Admin ${CREATED_BY_EMAIL} no encontrado`);

  const today = new Date();

  // ── Paso 1: Crear o actualizar CrmAccount faltantes ──
  // Distrito Los Trapenses (no existe)
  let trapenses = await prisma.crmAccount.findFirst({
    where: { tenantId: tenant.id, rut: "77009086-5" },
    select: { id: true, name: true },
  });
  if (!trapenses) {
    console.log("→ Crear CrmAccount 'Distrito Los Trapenses' (RUT 77009086-5)");
    if (APPLY) {
      trapenses = await prisma.crmAccount.create({
        data: {
          tenantId: tenant.id,
          name: "Distrito Los Trapenses",
          rut: "77009086-5",
          type: "client",
          status: "client_active",
          isActive: true,
        },
        select: { id: true, name: true },
      });
      console.log(`   ✓ Creado: ${trapenses.id}`);
    }
  } else {
    console.log(`→ CrmAccount Distrito Los Trapenses ya existe: ${trapenses.id}`);
  }

  // MAF Chile: completar RUT si está vacío
  const mafs = await prisma.crmAccount.findMany({
    where: { tenantId: tenant.id, name: "MAF Chile" },
    select: { id: true, rut: true },
  });
  if (mafs.length > 0 && !mafs[0].rut) {
    console.log(`→ Update CrmAccount 'MAF Chile' (${mafs[0].id}) con RUT 83415700-4`);
    if (APPLY) {
      await prisma.crmAccount.update({ where: { id: mafs[0].id }, data: { rut: "83415700-4" } });
      console.log("   ✓ Actualizado");
    }
  }

  // ── Paso 2: Crear las plantillas ──
  const existing = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  });
  const existingByName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));

  let created = 0;
  let skipped = 0;
  for (const tpl of TEMPLATES) {
    if (existingByName.has(tpl.name.toLowerCase())) {
      console.log(`= [${tpl.name}] ya existe — skip`);
      skipped++;
      continue;
    }

    // Buscar el CrmAccount. Normalizamos el RUT (sin puntos ni guión) porque en CRM hay
    // entradas con y sin formato (ej: "79932460-1" vs "799324601").
    let crmAccountId: string | null = null;
    if (tpl.crmRut) {
      const target = tpl.crmRut.replace(/[.\s-]/g, "").toLowerCase();
      const candidates = await prisma.crmAccount.findMany({
        where: { tenantId: tenant.id, rut: { not: null } },
        select: { id: true, name: true, rut: true, giro: true },
      });
      const match = candidates.find(
        (c) => c.rut && c.rut.replace(/[.\s-]/g, "").toLowerCase() === target,
      );
      if (match) crmAccountId = match.id;
    }
    if (!crmAccountId && tpl.crmName) {
      const match = await prisma.crmAccount.findFirst({
        where: { tenantId: tenant.id, name: tpl.crmName },
        select: { id: true },
      });
      if (match) crmAccountId = match.id;
    }
    if (!crmAccountId) {
      console.log(`⚠ [${tpl.name}] sin CrmAccount (rut ${tpl.crmRut ?? "—"}) — se crea con crmAccountId=null`);
    }

    const startDate = new Date(tpl.startDate + "T00:00:00Z");
    const nextRunAt = computeNextRun(startDate, tpl.dayOfMonth, today);

    const line: Record<string, unknown> = {
      itemName: "Servicio de Seguridad",
      description: tpl.itemDescription,
      quantity: 1,
      unit: null,
      discountPct: 0,
      isExempt: false,
    };
    if (tpl.currency === "UF") {
      line.unitPriceUf = tpl.unitPriceUf;
      line.unitPrice = 0; // se calcula al run
    } else {
      line.unitPrice = tpl.unitPrice;
    }

    const data: Prisma.FinanceDteRecurringTemplateUncheckedCreateInput = {
      tenantId: tenant.id,
      name: tpl.name,
      isActive: true,
      dteType: 33,
      receiverRut: tpl.receiverRut,
      receiverName: tpl.receiverName,
      receiverEmail: tpl.receiverEmail ?? null,
      receiverEmailCc: [],
      crmAccountId,
      currency: tpl.currency,
      lines: [line] as Prisma.InputJsonValue,
      notes: tpl.notes ?? null,
      frequency: "monthly",
      dayOfMonth: tpl.dayOfMonth,
      startDate,
      nextRunAt,
      autoSendEmail: true,
      ufFixingPolicy: tpl.currency === "UF" ? "LAST_DAY_PREV_MONTH" : "RUN_DAY",
      ufFixingDay: null,
      periodPolicy: "CURRENT_MONTH",
      createdBy: admin.id,
    };

    const priceLabel =
      tpl.currency === "UF"
        ? `${tpl.unitPriceUf} UF`
        : `$${(tpl.unitPrice ?? 0).toLocaleString("es-CL")}`;
    console.log(
      `+ [${tpl.name}] ${tpl.currency} ${priceLabel} día ${tpl.dayOfMonth} nextRun=${nextRunAt.toISOString().slice(0, 10)} crm=${crmAccountId ? "✓" : "—"}`,
    );
    if (APPLY) {
      const r = await prisma.financeDteRecurringTemplate.create({ data, select: { id: true } });
      console.log(`   ✓ id=${r.id}`);
    }
    created++;
  }

  console.log(`\n── Resumen ──`);
  console.log(`  Creadas: ${created}`);
  console.log(`  Ya existían (skip): ${skipped}`);
  console.log(`  Total intentado: ${TEMPLATES.length}`);
  if (!APPLY) console.log(`\n(No se aplicaron cambios. Correr con --apply para persistir.)`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
