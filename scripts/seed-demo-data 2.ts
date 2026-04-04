/**
 * Seed datos de prueba para el tenant Demo Security
 * Ejecutar después de crear el tenant con create-tenant.ts
 *
 * Uso: npx tsx scripts/seed-demo-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. Buscar tenant demo-security
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "demo-security" },
  });
  if (!tenant) {
    console.error(
      "❌ Tenant 'demo-security' no encontrado. Ejecutar create-tenant.ts primero.",
    );
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log("Tenant Demo Security ID:", tenantId);

  // 2. Crear 5 cuentas CRM (clientes del tenant demo)
  const accounts = [];
  const accountsData = [
    { name: "Edificio Central Norte", rut: "96.111.000-1", industry: "Residencial" },
    { name: "Mall Plaza Sur", rut: "96.222.000-2", industry: "Retail" },
    { name: "Banco Nacional Sucursal 5", rut: "96.333.000-3", industry: "Banca" },
    { name: "Parque Industrial Omega", rut: "96.444.000-4", industry: "Industrial" },
    { name: "Hospital Regional Demo", rut: "96.555.000-5", industry: "Salud" },
  ];

  for (const acc of accountsData) {
    const existing = await prisma.crmAccount.findFirst({
      where: { tenantId, name: acc.name },
    });
    if (existing) {
      if (!existing.isActive) {
        await prisma.crmAccount.update({
          where: { id: existing.id },
          data: { status: "client_active", isActive: true },
        });
        console.log(`🔧 Cuenta "${acc.name}" activada`);
      } else {
        console.log(`⏭️  Cuenta "${acc.name}" ya existe`);
      }
      accounts.push(existing);
      continue;
    }
    const created = await prisma.crmAccount.create({
      data: {
        tenantId,
        name: acc.name,
        rut: acc.rut,
        industry: acc.industry,
        status: "client_active",
        isActive: true,
      },
    });
    accounts.push(created);
    console.log(`✅ Cuenta creada: ${acc.name}`);
  }

  // 3. Crear instalaciones (sitios) con coordenadas reales en Santiago
  const installationsData = [
    {
      name: "Edificio Central Norte - Entrada Principal",
      accountIndex: 0,
      lat: -33.4372,
      lng: -70.6506,
      address: "Av. Providencia 1234, Santiago",
      geoRadius: 100,
    },
    {
      name: "Mall Plaza Sur - Acceso Estacionamiento",
      accountIndex: 1,
      lat: -33.5102,
      lng: -70.6028,
      address: "Av. Vicuña Mackenna 6100, La Florida",
      geoRadius: 150,
    },
    {
      name: "Banco Nacional Suc. 5 - Hall Principal",
      accountIndex: 2,
      lat: -33.4489,
      lng: -70.6693,
      address: "Alameda 2000, Santiago Centro",
      geoRadius: 50,
    },
    {
      name: "Parque Industrial Omega - Portería",
      accountIndex: 3,
      lat: -33.3978,
      lng: -70.5722,
      address: "Av. Las Condes 8500, Las Condes",
      geoRadius: 200,
    },
    {
      name: "Hospital Regional Demo - Urgencias",
      accountIndex: 4,
      lat: -33.4569,
      lng: -70.6483,
      address: "Av. Santa Rosa 1234, Santiago",
      geoRadius: 80,
    },
  ];

  const installations = [];
  for (const inst of installationsData) {
    const existing = await prisma.crmInstallation.findFirst({
      where: { tenantId, name: inst.name },
    });
    if (existing) {
      installations.push(existing);
      console.log(`⏭️  Instalación "${inst.name}" ya existe`);
      continue;
    }
    const created = await prisma.crmInstallation.create({
      data: {
        tenantId,
        accountId: accounts[inst.accountIndex].id,
        name: inst.name,
        address: inst.address,
        lat: inst.lat,
        lng: inst.lng,
        geoRadiusM: inst.geoRadius,
        status: "active",
      },
    });
    installations.push(created);
    console.log(`✅ Instalación creada: ${inst.name}`);
  }

  // 4. Crear 15 personas + guardias
  const guardiasData = [
    { firstName: "Carlos", lastName: "Muñoz", rut: "12.345.678-9" },
    { firstName: "María", lastName: "González", rut: "13.456.789-0" },
    { firstName: "Pedro", lastName: "Soto", rut: "14.567.890-1" },
    { firstName: "Ana", lastName: "López", rut: "15.678.901-2" },
    { firstName: "Juan", lastName: "Martínez", rut: "16.789.012-3" },
    { firstName: "Rosa", lastName: "Díaz", rut: "17.890.123-4" },
    { firstName: "Diego", lastName: "Hernández", rut: "18.901.234-5" },
    { firstName: "Laura", lastName: "Torres", rut: "19.012.345-6" },
    { firstName: "Miguel", lastName: "Vargas", rut: "20.123.456-7" },
    { firstName: "Carmen", lastName: "Rojas", rut: "21.234.567-8" },
    { firstName: "Felipe", lastName: "Castillo", rut: "22.345.678-9" },
    { firstName: "Sofía", lastName: "Reyes", rut: "23.456.789-0" },
    { firstName: "Andrés", lastName: "Morales", rut: "24.567.890-1" },
    { firstName: "Valentina", lastName: "Fuentes", rut: "25.678.901-2" },
    { firstName: "Roberto", lastName: "Sepúlveda", rut: "26.789.012-3" },
  ];

  const guardias = [];
  for (const g of guardiasData) {
    const existingPersona = await prisma.opsPersona.findFirst({
      where: { tenantId, rut: g.rut },
    });
    if (existingPersona) {
      const existingGuardia = await prisma.opsGuardia.findFirst({
        where: { tenantId, personaId: existingPersona.id },
      });
      if (existingGuardia) guardias.push(existingGuardia);
      console.log(`⏭️  Guardia "${g.firstName} ${g.lastName}" ya existe`);
      continue;
    }

    const persona = await prisma.opsPersona.create({
      data: {
        tenantId,
        firstName: g.firstName,
        lastName: g.lastName,
        rut: g.rut,
        email: `${g.firstName.toLowerCase()}.${g.lastName.toLowerCase()}@demo-security.cl`,
        phone: `+569${Math.floor(10000000 + Math.random() * 90000000)}`,
        status: "active",
      },
    });

    const guardia = await prisma.opsGuardia.create({
      data: {
        tenantId,
        personaId: persona.id,
        code: `DS-${String(guardias.length + 1).padStart(3, "0")}`,
        status: "active",
      },
    });

    guardias.push(guardia);
    console.log(
      `✅ Guardia creado: ${g.firstName} ${g.lastName} (${guardia.code})`,
    );
  }

  // 5. Resumen
  console.log("\n═══════════════════════════════════════");
  console.log("📊 RESUMEN SEED DEMO SECURITY");
  console.log("═══════════════════════════════════════");
  console.log(`  Cuentas CRM: ${accounts.length}`);
  console.log(`  Instalaciones: ${installations.length}`);
  console.log(`  Guardias: ${guardias.length}`);
  console.log("═══════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
