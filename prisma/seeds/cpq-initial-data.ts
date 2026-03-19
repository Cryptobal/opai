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
    // Uniformes
    { type: "uniform", name: "Camisa", unit: "unidad", basePrice: 15000, isDefault: true, defaultTechnicalSpecs: "Camisa operativa tipo polo u oxford, tela resistente, cuello reforzado, colores corporativos." },
    { type: "uniform", name: "Pantalon", unit: "unidad", basePrice: 18000, isDefault: true, defaultTechnicalSpecs: "Pantalón cargo u operativo, tela resistente, bolsillos reforzados, corte funcional." },
    { type: "uniform", name: "Zapato", unit: "unidad", basePrice: 32000, isDefault: true, defaultTechnicalSpecs: "Calzado de seguridad punta de acero, suela antideslizante, certificación según normativa vigente." },
    { type: "uniform", name: "Polar", unit: "unidad", basePrice: 22000, isDefault: true, defaultTechnicalSpecs: "Chaqueta polar tipo fleece, abrigo ligero, cuello alto, bolsillos." },
    { type: "uniform", name: "Geologo", unit: "unidad", basePrice: 25000, isDefault: true, defaultTechnicalSpecs: "Parka tipo geólogo, impermeable, reflectante, capucha desmontable." },
    { type: "uniform", name: "Chaqueta", unit: "unidad", basePrice: 35000, isDefault: true, defaultTechnicalSpecs: "Chaqueta impermeable, alta visibilidad, forro térmico, bolsillos internos." },
    { type: "uniform", name: "Velo", unit: "unidad", basePrice: 8000, isDefault: true, defaultTechnicalSpecs: "Gorro tipo velo o pasamontañas para protección contra frío." },
    { type: "uniform", name: "Casco", unit: "unidad", basePrice: 12000, isDefault: false, defaultTechnicalSpecs: "Casco de seguridad industrial, ajuste regulable, certificación ANSI/EN." },
    { type: "uniform", name: "EPP", unit: "unidad", basePrice: 20000, isDefault: false, defaultTechnicalSpecs: "Elementos de protección personal: guantes, anteojos, protectores auditivos según riesgo." },
    { type: "uniform", name: "Chaleco Antibalas", unit: "año", basePrice: 400000, isDefault: false, defaultTechnicalSpecs: "Chaleco antibalas Nivel IIIA (tipo MICH o PASGT), duración mínima 1 año, uno por guardia.", priceLogic: "prorated" },

    // Exámenes
    { type: "exam", name: "Preocupacional", unit: "examen", basePrice: 25000, isDefault: false, defaultTechnicalSpecs: "Examen médico pre-empleo según DS 594, aptitud para labores de seguridad." },
    { type: "exam", name: "Fisico", unit: "examen", basePrice: 12000, isDefault: false, defaultTechnicalSpecs: "Control de aptitud física para funciones operativas." },
    { type: "exam", name: "Psicotecnico", unit: "examen", basePrice: 18000, isDefault: false, defaultTechnicalSpecs: "Evaluación psicotécnica de idoneidad para labores de seguridad." },
    { type: "exam", name: "Altura", unit: "examen", basePrice: 22000, isDefault: false, defaultTechnicalSpecs: "Certificación trabajo en altura según normativa vigente." },
    { type: "exam", name: "Drogas", unit: "examen", basePrice: 20000, isDefault: false, defaultTechnicalSpecs: "Examen de detección de sustancias en orina o saliva." },

    // Equipo operativo
    { type: "system", name: "Sistema", unit: "mes", basePrice: 3500, isDefault: false, defaultTechnicalSpecs: "Plataforma de gestión operativa: novedades, rondas, reportes, monitoreo." },
    { type: "phone", name: "Telefono", unit: "mes", basePrice: 12000, isDefault: false, defaultTechnicalSpecs: "Teléfono celular corporativo, plan voz y datos, uso exclusivo laboral." },
    { type: "radio", name: "Radio", unit: "mes", basePrice: 8000, isDefault: false, defaultTechnicalSpecs: "Radio comunicador VHF/UHF, alcance según cobertura del sitio." },
    { type: "flashlight", name: "Linterna", unit: "mes", basePrice: 3000, isDefault: false, defaultTechnicalSpecs: "Linterna recargable LED, alta luminosidad, resistencia IP." },
    { type: "transport", name: "Transporte", unit: "mes", basePrice: 0, isDefault: false, defaultTechnicalSpecs: "Servicio de transporte personal ida y vuelta al lugar de trabajo." },

    // Alimentación
    { type: "meal", name: "Desayuno", unit: "comida", basePrice: 3500, isDefault: false, defaultTechnicalSpecs: "Incluye café/té, pan, lácteos, fruta o similar." },
    { type: "meal", name: "Almuerzo", unit: "comida", basePrice: 6500, isDefault: false, defaultTechnicalSpecs: "Menú ejecutivo completo: entrada, plato de fondo, postre, bebida." },
    { type: "meal", name: "Comida", unit: "comida", basePrice: 6500, isDefault: false, defaultTechnicalSpecs: "Menú completo equivalente a almuerzo o cena según turno." },
    { type: "meal", name: "Merienda", unit: "comida", basePrice: 2500, isDefault: false, defaultTechnicalSpecs: "Colación ligera: fruta, galleta, jugo o similar." },
  ];

  for (const item of catalogItems) {
    const existing = await prisma.cpqCatalogItem.findFirst({
      where: { name: item.name, type: item.type },
    });
    const payload = item as typeof item & { defaultTechnicalSpecs?: string; priceLogic?: string };
    if (existing) {
      await prisma.cpqCatalogItem.update({
        where: { id: existing.id },
        data: {
          unit: payload.unit,
          basePrice: payload.basePrice,
          isDefault: payload.isDefault ?? false,
          defaultTechnicalSpecs: payload.defaultTechnicalSpecs ?? null,
          ...(payload.priceLogic ? { priceLogic: payload.priceLogic } : {}),
        },
      });
    } else {
      await prisma.cpqCatalogItem.create({
        data: {
          type: payload.type,
          name: payload.name,
          unit: payload.unit,
          basePrice: payload.basePrice,
          isDefault: payload.isDefault ?? false,
          defaultTechnicalSpecs: payload.defaultTechnicalSpecs ?? null,
          priceLogic: payload.priceLogic ?? "uniform",
        },
      });
    }
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });

  // Includes suggestions (sugerencias predefinidas para "El servicio incluye")
  const includesSuggestions = [
    { text: "Personal acreditado ante OS-10 de Carabineros", isDefault: true, sortOrder: 1 },
    { text: "Supervisión periódica en terreno", isDefault: true, sortOrder: 2 },
    { text: "Cobertura por ausencias (reemplazo máx. 4 hrs)", isDefault: true, sortOrder: 3 },
    { text: "Seguro responsabilidad civil y accidentes laborales", isDefault: true, sortOrder: 4 },
    { text: "Libro de novedades digital vía OPAI", isDefault: true, sortOrder: 5 },
    { text: "Reportería mensual de operaciones", isDefault: true, sortOrder: 6 },
    { text: "Uniformes e implementos de seguridad", isDefault: false, sortOrder: 7 },
    { text: "Capacitación inicial y continua del personal", isDefault: false, sortOrder: 8 },
    { text: "Central de monitoreo 24/7", isDefault: false, sortOrder: 9 },
    { text: "Sistema de rondas con geolocalización", isDefault: false, sortOrder: 10 },
    { text: "Protocolo de emergencia personalizado", isDefault: false, sortOrder: 11 },
    { text: "Informe de incidentes en tiempo real", isDefault: false, sortOrder: 12 },
  ];

  for (const suggestion of includesSuggestions) {
    const existing = await prisma.cpqIncludesSuggestion.findFirst({
      where: { text: suggestion.text },
    });
    if (existing) {
      await prisma.cpqIncludesSuggestion.update({
        where: { id: existing.id },
        data: { isDefault: suggestion.isDefault, sortOrder: suggestion.sortOrder },
      });
    } else {
      await prisma.cpqIncludesSuggestion.create({
        data: {
          tenantId: tenant?.id ?? null,
          text: suggestion.text,
          isDefault: suggestion.isDefault,
          sortOrder: suggestion.sortOrder,
          isActive: true,
        },
      });
    }
  }

  // Proposal templates (formato canónico para PDF)
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
