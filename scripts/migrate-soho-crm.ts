/**
 * Script de migración: Soho CRM → Base de datos Opai
 *
 * Migra: Empresas → crm.accounts | Contactos (con empresa) → crm.contacts | Negocios (desduplicados) → crm.deals
 *
 * Uso: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-soho-crm.ts
 * O:   npm run migrate:soho
 */

import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), 'Datos CRM');

/** Id real del tenant (CUID). Debe resolverse por slug al inicio. */
let TENANT_ID: string;

// Mapeo Fase Soho → nombre stage
const FASE_TO_STAGE: Record<string, string> = {
  'Cierre ganado': 'Ganado',
  'Cierre perdido': 'Perdido',
  'Cliente Inactivo': 'Perdido',
};

function parseDate(val: string | undefined): Date | null {
  if (!val?.trim()) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseFloatOrNull(val: string | undefined): number | null {
  if (!val?.trim()) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function ensureStages() {
  const stages = [
    { name: 'Prospección', order: 1, color: '#64748b', isClosedWon: false, isClosedLost: false },
    { name: 'Cotización enviada', order: 2, color: '#3b82f6', isClosedWon: false, isClosedLost: false },
    { name: 'Negociación', order: 5, color: '#8b5cf6', isClosedWon: false, isClosedLost: false },
    { name: 'Ganado', order: 6, color: '#10b981', isClosedWon: true, isClosedLost: false },
    { name: 'Perdido', order: 7, color: '#ef4444', isClosedWon: false, isClosedLost: true },
  ];
  for (const s of stages) {
    await prisma.crmPipelineStage.upsert({
      where: { tenantId_name: { tenantId: TENANT_ID, name: s.name } },
      update: {},
      create: {
        tenantId: TENANT_ID,
        name: s.name,
        order: s.order,
        color: s.color,
        isClosedWon: s.isClosedWon,
        isClosedLost: s.isClosedLost,
      },
    });
  }
  return prisma.crmPipelineStage.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true },
  });
}

const BATCH_SIZE = 50;

async function migrateEmpresas(accountMap: Map<string, string>) {
  const filePath = path.join(DATA_DIR, 'Empresas_2026_02_09.csv');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parse(raw, { columns: true, relax_column_count: true, trim: true }) as Record<string, string>[];

  const toCreate: { sohoId: string; data: Record<string, unknown> }[] = [];
  for (const r of rows) {
    const sohoId = r['ID de registro']?.trim();
    const name = r['Nombre de Empresa']?.trim();
    if (!sohoId || !name) continue;
    toCreate.push({
      sohoId,
      data: {
        tenantId: TENANT_ID,
        name,
        rut: r['RUT Empresa']?.trim() || undefined,
        legalName: r['Razón social']?.trim() || undefined,
        legalRepresentativeName: r['Nombre Representante Legal']?.trim() || undefined,
        legalRepresentativeRut: r['RUT Representante Legal']?.trim() || undefined,
        industry: r['Sector']?.trim() || undefined,
        website: r['Sitio web']?.trim() || undefined,
      },
    });
  }

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ data }) => prisma.crmAccount.create({ data: data as Parameters<typeof prisma.crmAccount.create>[0]['data'] }))
    );
    batch.forEach(({ sohoId }, idx) => accountMap.set(sohoId, results[idx].id));
  }
  return accountMap.size;
}

async function migrateContactos(accountMap: Map<string, string>, contactMap: Map<string, string>) {
  const filePath = path.join(DATA_DIR, 'Contactos_2026_02_09.csv');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parse(raw, { columns: true, relax_column_count: true, trim: true }) as Record<string, string>[];

  const toCreate: { sohoId: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const empresaId = r['Nombre de Empresa.id']?.trim();
    if (!empresaId) {
      skipped++;
      continue;
    }
    const accountId = accountMap.get(empresaId);
    if (!accountId) continue;

    const sohoId = r['ID de registro']?.trim();
    if (!sohoId) continue;

    const firstName = (r['Nombre']?.trim() || ' ').substring(0, 255) || 'Sin nombre';
    const lastName = (r['Apellidos']?.trim() || ' ').substring(0, 255) || ' ';

    toCreate.push({
      sohoId,
      data: {
        tenantId: TENANT_ID,
        accountId,
        firstName,
        lastName,
        email: r['Correo electrónico']?.trim() || undefined,
        phone: r['Móvil']?.trim() || undefined,
      },
    });
  }

  for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
    const batch = toCreate.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(({ data }) => prisma.crmContact.create({ data: data as Parameters<typeof prisma.crmContact.create>[0]['data'] }))
    );
    batch.forEach(({ sohoId }, idx) => contactMap.set(sohoId, results[idx].id));
  }
  return { created: contactMap.size, skipped };
}

async function migrateNegocios(
  accountMap: Map<string, string>,
  contactMap: Map<string, string>,
  stageMap: Map<string, string>
) {
  const filePath = path.join(DATA_DIR, 'Negocios_2026_02_09.csv');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parse(raw, { columns: true, relax_column_count: true, trim: true }) as Record<string, string>[];

  const seen = new Set<string>();
  const dealPromises: Promise<unknown>[] = [];
  let created = 0;
  let skippedDup = 0;
  let skippedNoAccount = 0;

  for (const r of rows) {
    const empresaId = r['Nombre de Empresa.id']?.trim();
    const title = r['Nombre de Negocio']?.trim();
    if (!empresaId || !title) continue;

    const accountId = accountMap.get(empresaId);
    if (!accountId) {
      skippedNoAccount++;
      continue;
    }

    const dedupKey = `${title}|${empresaId}`;
    if (seen.has(dedupKey)) {
      skippedDup++;
      continue;
    }
    seen.add(dedupKey);

    const fase = r['Fase']?.trim() || '';
    const stageName = FASE_TO_STAGE[fase] || 'Prospección';
    const stageId = stageMap.get(stageName) || stageMap.get('Prospección');
    if (!stageId) continue;

    const contactId = (() => {
      const cid = r['Nombre de Contacto.id']?.trim();
      return cid ? contactMap.get(cid) ?? null : null;
    })();

    const closeDate = parseDate(r['Fecha de cierre']);
    const proposalSentAt = parseDate(r['Fecha envio propuesta']);
    const techVisitDate = parseDate(r['Fecha Visita Técnica']);

    dealPromises.push(
      prisma.crmDeal.create({
        data: {
          tenantId: TENANT_ID,
          accountId,
          primaryContactId: contactId,
          title,
          stageId,
          expectedCloseDate: closeDate,
          status: ['Cierre ganado', 'Cierre perdido', 'Cliente Inactivo'].includes(fase) ? 'closed' : 'open',
          proposalLink: r['Link propuesta']?.trim() || undefined,
          proposalSentAt: proposalSentAt ? new Date(proposalSentAt.getFullYear(), proposalSentAt.getMonth(), proposalSentAt.getDate()) : undefined,
          dealType: r['Tipo']?.trim() || undefined,
          notes: r['Descripción']?.trim() || undefined,
          driveFolderLink: r['Carpeta Drive']?.trim() || undefined,
          installationName: r['Nombre instalación (inicial)']?.trim() || undefined,
          technicalVisitDate: techVisitDate ? new Date(techVisitDate.getFullYear(), techVisitDate.getMonth(), techVisitDate.getDate()) : undefined,
          service: r['Servicio']?.trim() || undefined,
          street: r['Calle']?.trim() || undefined,
          address: r['Dirección Google Maps']?.trim() || undefined,
          city: r['Ciudad']?.trim() || undefined,
          commune: r['Comuna']?.trim() || undefined,
          lat: parseFloatOrNull(r['Latitud']) ?? undefined,
          lng: parseFloatOrNull(r['Longitud']) ?? undefined,
          installationWebsite: r['Página web']?.trim() || undefined,
        },
      })
    );
    created++;
  }

  for (let i = 0; i < dealPromises.length; i += BATCH_SIZE) {
    await Promise.all(dealPromises.slice(i, i + BATCH_SIZE));
  }
  return { created, skippedDup, skippedNoAccount };
}

async function main() {
  const tenantSlug = process.env.TENANT_SLUG || 'gard';
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug, active: true },
  });
  if (!tenant) {
    console.error('❌ No se encontró tenant con slug "' + tenantSlug + '". Ejecuta antes: npx prisma db seed');
    process.exit(1);
  }
  TENANT_ID = tenant.id;

  console.log('🚀 Migración Soho CRM → Opai');
  console.log('   Tenant:', tenantSlug, '(' + TENANT_ID + ')');
  console.log('   Directorio:', DATA_DIR);

  if (!fs.existsSync(DATA_DIR)) {
    console.error('❌ No existe el directorio "Datos CRM"');
    process.exit(1);
  }

  const stages = await ensureStages();
  const stageMap = new Map(stages.map((s) => [s.name, s.id]));
  console.log('✅ Stages listos:', stageMap.size);

  const accountMap = new Map<string, string>();
  const countEmpresas = await migrateEmpresas(accountMap);
  console.log('✅ Empresas migradas:', countEmpresas, '| Mapa:', accountMap.size);

  const contactMap = new Map<string, string>();
  const { created: countContacts, skipped: skippedContacts } = await migrateContactos(accountMap, contactMap);
  console.log('✅ Contactos migrados:', countContacts, '| Omitidos sin empresa:', skippedContacts);

  const { created: countDeals, skippedDup, skippedNoAccount } = await migrateNegocios(
    accountMap,
    contactMap,
    stageMap
  );
  console.log(
    '✅ Negocios migrados:',
    countDeals,
    '| Duplicados omitidos:',
    skippedDup,
    '| Sin cuenta:',
    skippedNoAccount
  );

  console.log('\n🎉 Migración completada');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
