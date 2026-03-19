/**
 * Actualiza defaultTechnicalSpecs en TODOS los ítems del catálogo que no lo tienen.
 * Ejecutar: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/update-catalog-specs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SPECS_BY_NAME: Record<string, string> = {
  // Uniformes
  Camisa: "Camisa operativa tipo polo u oxford, tela resistente, cuello reforzado, colores corporativos.",
  Pantalón: "Pantalón cargo u operativo, tela resistente, bolsillos reforzados, corte funcional.",
  Pantalon: "Pantalón cargo u operativo, tela resistente, bolsillos reforzados, corte funcional.",
  Zapato: "Calzado de seguridad punta de acero, suela antideslizante, certificación según normativa vigente.",
  Polar: "Chaqueta polar tipo fleece, abrigo ligero, cuello alto, bolsillos.",
  Geologo: "Parka tipo geólogo, impermeable, reflectante, capucha desmontable.",
  Chaqueta: "Chaqueta impermeable, alta visibilidad, forro térmico, bolsillos internos.",
  Velo: "Gorro tipo velo o pasamontañas para protección contra frío.",
  Casco: "Casco de seguridad industrial, ajuste regulable, certificación ANSI/EN.",
  EPP: "Elementos de protección personal: guantes, anteojos, protectores auditivos según riesgo.",
  "Chaleco Antikorper": "Chaleco antibalas/cortantes, nivel según requerimiento del cliente.",
  Antiparra: "Anteojos de protección contra impacto, UV y partículas.",
  "Botas de agua": "Botas impermeables, suela antideslizante, certificación según uso.",
  "Capa de agua": "Capa impermeable, alta visibilidad, forro térmico opcional.",
  "Chaleco anticorte": "Chaleco anticorte nivel según requerimiento del cliente.",
  Quepi: "Gorra tipo quepi, colores corporativos, ajuste regulable.",
  Termico: "Prenda térmica interior, capa base para frío.",
  // Exámenes
  Preocupacional: "Examen médico pre-empleo según DS 594, aptitud para labores de seguridad.",
  Fisico: "Control de aptitud física para funciones operativas.",
  Psicotecnico: "Evaluación psicotécnica de idoneidad para labores de seguridad.",
  Psicosensotécnico: "Evaluación psicotécnica de idoneidad para labores de seguridad.",
  Altura: "Certificación trabajo en altura según normativa vigente.",
  Drogas: "Examen de detección de sustancias en orina o saliva.",
  // Equipo
  Sistema: "Plataforma de gestión operativa: novedades, rondas, reportes, monitoreo.",
  Telefono: "Teléfono celular corporativo, plan voz y datos, uso exclusivo laboral.",
  Celular: "Teléfono celular corporativo, plan voz y datos, uso exclusivo laboral.",
  Radio: "Radio comunicador VHF/UHF, alcance según cobertura del sitio.",
  Linterna: "Linterna recargable LED, alta luminosidad, resistencia IP.",
  "Plan datos": "Plan de datos móvil para uso corporativo.",
  Transporte: "Servicio de transporte personal ida y vuelta al lugar de trabajo.",
  Traslado: "Servicio de traslado o movilización del personal.",
  // Alimentación
  Desayuno: "Incluye café/té, pan, lácteos, fruta o similar.",
  Almuerzo: "Menú ejecutivo completo: entrada, plato de fondo, postre, bebida.",
  Comida: "Menú completo equivalente a almuerzo o cena según turno.",
  Merienda: "Colación ligera: fruta, galleta, jugo o similar.",
  // Infraestructura
  Baño: "Módulo sanitario o baño químico para instalación.",
  Caseta: "Caseta de vigilancia, dimensiones según requerimiento.",
  Generador: "Generador eléctrico para respaldo o uso en sitio.",
  // Vehículos
  Bencina: "Combustible para vehículo operativo, cálculo según km/día y rendimiento.",
  "Arriendo vehículo": "Arriendo vehicular. Especificar: tipo (camioneta, pickup, etc.), capacidad.",
  Mantención: "Mantención preventiva y correctiva del vehículo operativo.",
  TAG: "TAG para peajes, uso según rutas del servicio.",
  // Otros
  "Costo financiero": "Financiamiento de la propuesta: tasa y plazo según condiciones.",
  "Póliza de garantía": "Póliza de garantía según monto y plazo del contrato.",
  "Face ID": "Sistema de control de acceso biométrico facial.",
  Rondas: "Sistema de rondas con geolocalización y reportes.",
};

const SPECS_BY_TYPE: Record<string, string> = {
  uniform: "Prenda o implemento de vestuario operativo según norma.",
  exam: "Examen o certificación según requerimiento del cliente.",
  meal: "Alimentación según tipo de servicio y turno.",
  phone: "Equipo de comunicación corporativo.",
  radio: "Radio comunicador VHF/UHF.",
  flashlight: "Linterna recargable LED.",
  transport: "Servicio de transporte o movilización.",
  system: "Sistema o plataforma de gestión operativa.",
  infrastructure: "Infraestructura o instalación según requerimiento.",
  fuel: "Combustible según cálculo de uso.",
  vehicle_rent: "Arriendo vehicular. Especificar tipo y capacidad.",
  vehicle_fuel: "Combustible para vehículo operativo.",
  vehicle_tag: "TAG para peajes.",
  financial: "Costo financiero según condiciones.",
  policy: "Póliza según monto y plazo.",
};

async function main() {
  const items = await prisma.cpqCatalogItem.findMany({
    where: { active: true },
    select: { id: true, name: true, type: true, defaultTechnicalSpecs: true },
  });

  let updated = 0;
  for (const item of items) {
    if (item.defaultTechnicalSpecs) continue;

    const specs =
      SPECS_BY_NAME[item.name] ||
      SPECS_BY_NAME[item.name.trim()] ||
      SPECS_BY_TYPE[item.type] ||
      `Especificaciones técnicas según requerimiento del cliente para ${item.name}.`;

    await prisma.cpqCatalogItem.update({
      where: { id: item.id },
      data: { defaultTechnicalSpecs: specs },
    });
    console.log("✓", item.name, "(" + item.type + ")");
    updated++;
  }

  console.log("\n✅ Actualizados:", updated, "ítems");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
