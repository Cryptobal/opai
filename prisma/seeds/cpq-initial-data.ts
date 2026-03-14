/**
 * CPQ INITIAL SEED DATA
 * Catálogos base de Cargos, Roles y Puestos de Trabajo
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedCpqData() {
  console.log("🌱 Seeding CPQ data...");

  const cargos = [
    { name: "Guardia", description: "Personal operativo estándar" },
    { name: "Supervisor", description: "Supervisión de turnos y equipos" },
    { name: "Inspector", description: "Inspección y control de calidad" },
    { name: "Jefe de Turno", description: "Responsable de operación por turno" },
    { name: "Operador CCTV", description: "Monitoreo de cámaras y alarmas" },
  ];

  const roles = [
    { name: "4x4", description: "4 días trabajo / 4 descanso" },
    { name: "5x2", description: "5 días trabajo / 2 descanso" },
    { name: "2x5", description: "2 días trabajo / 5 descanso" },
    { name: "6x1", description: "6 días trabajo / 1 descanso" },
    { name: "7x7", description: "7 días trabajo / 7 descanso" },
    { name: "Turno Especial", description: "Coberturas especiales" },
  ];

  const puestos = [
    { name: "Portería" },
    { name: "Control de Acceso" },
    { name: "CCTV (Centro de Control)" },
    { name: "Ronda" },
    { name: "Supervisión" },
    { name: "Recepción" },
    { name: "Estacionamiento" },
    { name: "Otro" },
  ];

  for (const cargo of cargos) {
    const existing = await prisma.cpqCargo.findFirst({ where: { name: cargo.name } });
    if (existing) {
      await prisma.cpqCargo.update({ where: { id: existing.id }, data: { description: cargo.description } });
    } else {
      await prisma.cpqCargo.create({ data: cargo });
    }
  }

  for (const rol of roles) {
    const existing = await prisma.cpqRol.findFirst({ where: { name: rol.name } });
    if (existing) {
      await prisma.cpqRol.update({ where: { id: existing.id }, data: { description: rol.description } });
    } else {
      await prisma.cpqRol.create({ data: rol });
    }
  }

  for (const puesto of puestos) {
    const existing = await prisma.cpqPuestoTrabajo.findFirst({ where: { name: puesto.name } });
    if (!existing) {
      await prisma.cpqPuestoTrabajo.create({ data: puesto });
    }
  }

  const catalogItems = [
    { type: "uniform", name: "Camisa", unit: "unidad", basePrice: 15000, isDefault: true },
    { type: "uniform", name: "Pantalon", unit: "unidad", basePrice: 18000, isDefault: true },
    { type: "uniform", name: "Zapato", unit: "unidad", basePrice: 32000, isDefault: true },
    { type: "uniform", name: "Polar", unit: "unidad", basePrice: 22000, isDefault: true },
    { type: "uniform", name: "Geologo", unit: "unidad", basePrice: 25000, isDefault: true },
    { type: "uniform", name: "Chaqueta", unit: "unidad", basePrice: 35000, isDefault: true },
    { type: "uniform", name: "Velo", unit: "unidad", basePrice: 8000, isDefault: true },
    { type: "uniform", name: "Casco", unit: "unidad", basePrice: 12000, isDefault: false },
    { type: "uniform", name: "EPP", unit: "unidad", basePrice: 20000, isDefault: false },
    { type: "uniform", name: "Chaleco Antikorper", unit: "unidad", basePrice: 28000, isDefault: false },

    { type: "exam", name: "Preocupacional", unit: "examen", basePrice: 25000, isDefault: false },
    { type: "exam", name: "Fisico", unit: "examen", basePrice: 12000, isDefault: false },
    { type: "exam", name: "Psicotecnico", unit: "examen", basePrice: 18000, isDefault: false },
    { type: "exam", name: "Altura", unit: "examen", basePrice: 22000, isDefault: false },
    { type: "exam", name: "Drogas", unit: "examen", basePrice: 20000, isDefault: false },

    { type: "system", name: "Sistema", unit: "mes", basePrice: 3500, isDefault: false },
    { type: "phone", name: "Telefono", unit: "mes", basePrice: 12000, isDefault: false },
    { type: "radio", name: "Radio", unit: "mes", basePrice: 8000, isDefault: false },
    { type: "flashlight", name: "Linterna", unit: "mes", basePrice: 3000, isDefault: false },
    { type: "transport", name: "Transporte", unit: "mes", basePrice: 0, isDefault: false },

    { type: "meal", name: "Desayuno", unit: "comida", basePrice: 3500, isDefault: false },
    { type: "meal", name: "Almuerzo", unit: "comida", basePrice: 6500, isDefault: false },
    { type: "meal", name: "Comida", unit: "comida", basePrice: 6500, isDefault: false },
    { type: "meal", name: "Merienda", unit: "comida", basePrice: 2500, isDefault: false },
  ];

  for (const item of catalogItems) {
    const existing = await prisma.cpqCatalogItem.findFirst({
      where: { name: item.name, type: item.type },
    });
    if (existing) {
      await prisma.cpqCatalogItem.update({
        where: { id: existing.id },
        data: {
          unit: item.unit,
          basePrice: item.basePrice,
          isDefault: item.isDefault ?? false,
        },
      });
    } else {
      await prisma.cpqCatalogItem.create({ data: item });
    }
  }

  // Proposal templates (formato canónico para PDF)
  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
  const proposalTemplates = [
    {
      slug: "estandar",
      name: "Estándar",
      description: "Tabla de puestos, resumen y condiciones",
      sections: {
        showCoverPage: true,
        showCompanyIntro: true,
        showPositionsTable: true,
        showCostBreakdown: false,
        showCostSummaryByCategory: false,
        showLaborDetail: false,
        showEquipmentDetail: false,
        showVehicleDetail: false,
        showAdditionalServices: true,
        showConditions: true,
        showIncludedItems: true,
        showSignature: true,
        showComplianceSection: false,
        numberedSections: false,
        headerStyle: "standard",
      },
      isDefault: true,
    },
    {
      slug: "detallado",
      name: "Detallado",
      description: "Incluye desglose por categoría y detalle mano de obra",
      sections: {
        showCoverPage: true,
        showCompanyIntro: true,
        showPositionsTable: true,
        showCostBreakdown: true,
        showCostSummaryByCategory: true,
        showLaborDetail: true,
        showEquipmentDetail: true,
        showVehicleDetail: true,
        showAdditionalServices: true,
        showConditions: true,
        showIncludedItems: true,
        showSignature: true,
        showComplianceSection: false,
        numberedSections: false,
        headerStyle: "detailed",
      },
      isDefault: false,
    },
    {
      slug: "licitacion",
      name: "Licitación",
      description: "Secciones numeradas y cumplimiento normativo",
      sections: {
        showCoverPage: true,
        showCompanyIntro: true,
        showPositionsTable: true,
        showCostBreakdown: true,
        showCostSummaryByCategory: true,
        showLaborDetail: true,
        showEquipmentDetail: true,
        showVehicleDetail: true,
        showAdditionalServices: true,
        showConditions: true,
        showIncludedItems: true,
        showSignature: true,
        showComplianceSection: true,
        numberedSections: true,
        headerStyle: "formal",
      },
      isDefault: false,
    },
  ];

  for (const tpl of proposalTemplates) {
    const existing = await prisma.cpqProposalTemplate.findFirst({
      where: { slug: tpl.slug, OR: [{ tenantId: tenant?.id ?? null }, { tenantId: null }] },
    });
    if (existing) {
      await prisma.cpqProposalTemplate.update({
        where: { id: existing.id },
        data: { sections: tpl.sections as object, name: tpl.name, description: tpl.description },
      });
    } else {
      await prisma.cpqProposalTemplate.create({
        data: {
          tenantId: tenant?.id ?? null,
          slug: tpl.slug,
          name: tpl.name,
          description: tpl.description,
          sections: tpl.sections as object,
          isDefault: tpl.isDefault,
          active: true,
        },
      });
    }
  }

  console.log("✅ CPQ data seeded successfully!");
}

export default seedCpqData;
