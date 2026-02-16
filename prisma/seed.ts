/**
 * Prisma Seed Script
 * 
 * Poblar la base de datos con datos iniciales
 * 
 * Ejecutar con: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedPayrollData } from './seeds/payroll-initial-data';
import { seedCpqData } from './seeds/cpq-initial-data';
import { seedCrmData } from './seeds/crm-initial-data';
import { seedGroupsAndTicketTypes } from './seeds/ops-groups-ticket-types';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 0. Crear tenant "gard" si no existe
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'gard' },
    update: {},
    create: {
      slug: 'gard',
      name: 'Gard Security',
      active: true,
    },
  });
  console.log('✅ Tenant "gard" ready:', tenant.id);

  // 1. Crear template "Commercial" (con tenantId)
  const commercialTemplate = await prisma.template.upsert({
    where: { slug: 'commercial' },
    update: { tenantId: tenant.id },
    create: {
      name: 'Propuesta Comercial',
      slug: 'commercial',
      description: 'Template completo para presentaciones comerciales B2B con 28 secciones',
      type: 'presentation',
      category: 'sales',
      active: true,
      isDefault: true,
      thumbnailUrl: null,
      tenantId: tenant.id,
    },
  });

  console.log('✅ Template "Commercial" created:', commercialTemplate.id);

  // 2. Crear admin user (con tenantId y status en lugar de active)
  const hashedPassword = await bcrypt.hash('GardSecurity2026!', 10);
  
  const admin = await prisma.admin.upsert({
    where: { email: 'carlos.irigoyen@gard.cl' },
    update: { tenantId: tenant.id, status: 'active' },
    create: {
      email: 'carlos.irigoyen@gard.cl',
      password: hashedPassword,
      name: 'Carlos Irigoyen',
      role: 'owner',
      status: 'active',
      tenantId: tenant.id,
      activatedAt: new Date(),
    },
  });

  console.log('✅ Admin user created:', admin.email);

  // 3. Crear settings por defecto
  const settings = [
    {
      key: 'site_name',
      value: 'Gard Docs',
      type: 'string',
      category: 'general',
    },
    {
      key: 'default_template_id',
      value: commercialTemplate.id,
      type: 'string',
      category: 'general',
    },
    {
      key: 'session_expiry_hours',
      value: '24',
      type: 'number',
      category: 'general',
    },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log('✅ Settings created');

  // 4. Seed Payroll data
  await seedPayrollData();
  // 5. Seed CPQ data
  await seedCpqData();
  // 6. Seed CRM data
  await seedCrmData(tenant.id);

  // 7. Seed Ops groups & ticket types
  await seedGroupsAndTicketTypes(tenant.id);

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
