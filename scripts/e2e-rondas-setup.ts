/**
 * E2E Test Setup: Create installation "Gard" and guard with RUT 13255838-8
 * Run with: npx tsx scripts/e2e-rondas-setup.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = await prisma.tenant.findFirst({ where: { slug: 'gard' } });
  if (!tenantId) throw new Error('Tenant "gard" not found. Run prisma db seed first.');
  const tid = tenantId.id;
  console.log('Tenant ID:', tid);

  // 1. Create CRM Account for Gard
  const account = await prisma.crmAccount.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: tid,
      name: 'Gard Security SpA',
      industry: 'Seguridad',
      type: 'cliente',
      status: 'activa',
    },
  });
  console.log('Account:', account.id, account.name);

  // 2. Create Installation "Gard"
  const installation = await prisma.crmInstallation.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: tid,
      accountId: account.id,
      name: 'Gard - Oficina Central',
      address: 'Av. Providencia 1234',
      city: 'Santiago',
      commune: 'Providencia',
      lat: -33.4372,
      lng: -70.6506,
      isActive: true,
      geoRadiusM: 200,
      marcacionCode: 'GARD-CENTRAL-001',
      nocturnoEnabled: true,
    },
  });
  console.log('Installation:', installation.id, installation.name);

  // 3. Create OpsPersona for the guard
  const persona = await prisma.opsPersona.upsert({
    where: { id: '00000000-0000-0000-0000-000000000100' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000100',
      tenantId: tid,
      firstName: 'Juan',
      lastName: 'Pérez',
      rut: '13255838-8',
      email: 'juan.perez@gard.cl',
      phoneMobile: '+56912345678',
    },
  });
  console.log('Persona:', persona.id, persona.firstName, persona.lastName, persona.rut);

  // 4. Create OpsGuardia
  const guardia = await prisma.opsGuardia.upsert({
    where: { personaId: persona.id },
    update: {
      currentInstallationId: installation.id,
      status: 'active',
      marcacionPinVisible: '1234',
    },
    create: {
      id: '00000000-0000-0000-0000-000000001000',
      tenantId: tid,
      personaId: persona.id,
      code: 'G-001',
      status: 'active',
      lifecycleStatus: 'activo',
      currentInstallationId: installation.id,
      marcacionPinVisible: '1234',
      hiredAt: new Date('2024-01-15'),
    },
  });
  console.log('Guardia:', guardia.id, 'PIN:', guardia.marcacionPinVisible);

  // Summary
  console.log('\n=== E2E Setup Complete ===');
  console.log('Tenant ID:', tid);
  console.log('Installation ID:', installation.id);
  console.log('Installation Code:', installation.marcacionCode);
  console.log('Persona ID:', persona.id);
  console.log('Guardia ID:', guardia.id);
  console.log('RUT:', persona.rut);
  console.log('PIN:', guardia.marcacionPinVisible);
}

main()
  .catch(e => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
