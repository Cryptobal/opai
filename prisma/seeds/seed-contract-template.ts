/**
 * Seed: Template de Contrato de Prestación de Servicios de Vigilancia
 *
 * Crea el template completo para contratos con clientes CRM, incluyendo:
 * 1. Cuerpo principal (cláusulas PRIMERA a DÉCIMA QUINTA)
 * 2. ANEXO 1 — Notificación de Servicio
 * 3. ANEXO 2 — Normas del Puesto
 *
 * Tokens multi-tenant: empresa.*, account.*, contact.*, deal.*, quote.*, contract.*, installation.*
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ── Tiptap helpers ── */

function buildTiptapDoc(blocks: any[]): any {
  return { type: "doc", content: blocks };
}

function p(children: any[], attrs?: any): any {
  return { type: "paragraph", content: children, ...(attrs ? { attrs } : {}) };
}

function t(content: string, marks?: any[]): any {
  return { type: "text", text: content, ...(marks ? { marks } : {}) };
}

function b(content: string): any {
  return t(content, [{ type: "bold" }]);
}

function u(content: string): any {
  return t(content, [{ type: "underline" }]);
}

function bu(content: string): any {
  return t(content, [{ type: "bold" }, { type: "underline" }]);
}

function tk(tokenKey: string): any {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}

function signatureTk(signerOrder: number): any {
  return {
    type: "contractToken",
    attrs: {
      tokenKey: `signature.signer_${signerOrder}`,
      label: `signature.signer_${signerOrder}`,
      signerOrder,
    },
  };
}

function h(level: number, children: any[]): any {
  return { type: "heading", attrs: { level }, content: children };
}

function hr(): any {
  return { type: "horizontalRule" };
}

function emptyP(): any {
  return { type: "paragraph" };
}

/* ── Contract content ── */

const content = buildTiptapDoc([
  // ═══════════ HEADER ═══════════
  h(1, [bu("CONTRATO DE PRESTACIÓN DE SERVICIOS DE VIGILANCIA PRIVADA")]),
  emptyP(),

  // ── Comparecientes ──
  p([
    t("En "),
    tk("empresa.comuna"),
    t(", a "),
    tk("contract.effectiveDate"),
    t(", entre "),
    b("LA EMPRESA DE SEGURIDAD: "),
    tk("empresa.razonSocial"),
    t(", RUT "),
    tk("empresa.rut"),
    t(", representada legalmente por don "),
    tk("empresa.repLegalNombre"),
    t(", RUT "),
    tk("empresa.repLegalRut"),
    t(", ambos con domicilio en "),
    tk("empresa.direccion"),
    t(", comuna de "),
    tk("empresa.comuna"),
    t(", en adelante "),
    b('"LA EMPRESA"'),
    t("; y por la otra, "),
    b("EL CLIENTE: "),
    tk("account.legalName"),
    t(", RUT "),
    tk("account.rut"),
    t(", representada legalmente por don(a) "),
    tk("account.legalRepresentativeName"),
    t(", RUT "),
    tk("account.legalRepresentativeRut"),
    t(", ambos con domicilio en "),
    tk("account.address"),
    t(", comuna de "),
    tk("account.commune"),
    t(", en adelante "),
    b('"EL CLIENTE"'),
    t(", se ha convenido el siguiente contrato de prestación de servicios de vigilancia privada:"),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA PRIMERA ═══════════
  h(2, [bu("PRIMERA: Objeto del Contrato")]),
  p([
    t("LA EMPRESA se obliga a prestar servicios de vigilancia privada en las dependencias de EL CLIENTE, ubicadas en "),
    tk("installation.name"),
    t(", dirección "),
    tk("installation.address"),
    t(", comuna de "),
    tk("installation.commune"),
    t(", de acuerdo a las condiciones y dotación establecidas en el Anexo 1 de este contrato."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA SEGUNDA ═══════════
  h(2, [bu("SEGUNDA: Dotación y Servicios")]),
  p([
    t("La dotación de guardias de seguridad se detalla a continuación:"),
  ]),
  p([tk("quote.positionsTable")]),
  p([
    t("Resumen de dotación: "),
    tk("quote.dotacionResumen"),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA TERCERA ═══════════
  h(2, [bu("TERCERA: Precio y Forma de Pago")]),
  p([
    t("El precio mensual por los servicios descritos asciende a la suma de "),
    b("$"),
    tk("quote.salePriceMonthly"),
    t(" (pesos chilenos), más IVA, equivalente a "),
    tk("quote.salePriceUF"),
    t(" UF aproximadamente."),
  ]),
  p([
    t("EL CLIENTE pagará mensualmente a LA EMPRESA, dentro de los primeros 5 días hábiles del mes siguiente al de la prestación de los servicios, contra la presentación de la factura correspondiente."),
  ]),
  p([
    t("El valor total del contrato por "),
    tk("quote.contractMonths"),
    t(" meses de servicio asciende a "),
    b("$"),
    tk("quote.contractAmount"),
    t(" más IVA."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA CUARTA ═══════════
  h(2, [bu("CUARTA: Plazo del Contrato")]),
  p([
    t("El presente contrato tendrá una duración de "),
    tk("contract.durationMonths"),
    t(" meses, desde el "),
    tk("contract.effectiveDate"),
    t(" hasta el "),
    tk("contract.expirationDate"),
    t(", renovándose automáticamente por períodos iguales y sucesivos, salvo que cualquiera de las partes manifieste su voluntad de no renovarlo, mediante carta certificada enviada con a lo menos 60 días de anticipación al término del período vigente."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA QUINTA ═══════════
  h(2, [bu("QUINTA: Obligaciones de LA EMPRESA")]),
  p([t("LA EMPRESA se obliga a:")]),
  p([t("a) Prestar los servicios de vigilancia de acuerdo a la dotación, horarios y turnos acordados en el Anexo 1.")]),
  p([t("b) Contratar personal debidamente capacitado y acreditado ante la autoridad competente (OS-10 de Carabineros de Chile).")]),
  p([t("c) Proporcionar uniformes, equipos de comunicación y elementos de seguridad necesarios para la correcta prestación del servicio.")]),
  p([t("d) Supervisar periódicamente la correcta prestación de los servicios y el cumplimiento de los protocolos de seguridad.")]),
  p([t("e) Mantener vigentes todas las autorizaciones, permisos y seguros requeridos por la normativa vigente (D.L. 3607 y su Reglamento).")]),
  p([t("f) Reemplazar al personal en caso de ausencia, licencia médica o vacaciones, dentro de las 24 horas siguientes a la notificación.")]),
  p([t("g) Responder solidariamente de las obligaciones laborales y previsionales con su personal.")]),
  emptyP(),

  // ═══════════ CLÁUSULA SEXTA ═══════════
  h(2, [bu("SEXTA: Obligaciones de EL CLIENTE")]),
  p([t("EL CLIENTE se obliga a:")]),
  p([t("a) Pagar el precio convenido en la forma y plazo establecidos en la cláusula tercera.")]),
  p([t("b) Proporcionar las facilidades necesarias para la correcta prestación de los servicios (garita, baño, lugar para colación).")]),
  p([t("c) Informar oportunamente a LA EMPRESA de cualquier situación de riesgo o evento que pueda afectar la seguridad del recinto.")]),
  p([t("d) Respetar los protocolos y procedimientos de seguridad establecidos por LA EMPRESA.")]),
  p([t("e) No instruir directamente al personal de seguridad, debiendo canalizar sus requerimientos a través del supervisor designado por LA EMPRESA.")]),
  emptyP(),

  // ═══════════ CLÁUSULA SÉPTIMA ═══════════
  h(2, [bu("SÉPTIMA: Responsabilidades")]),
  p([
    t("LA EMPRESA será responsable de los daños que su personal cause a los bienes de EL CLIENTE por negligencia o dolo, debidamente comprobados, hasta por un monto máximo equivalente al valor de 3 meses de servicio. LA EMPRESA mantendrá vigente una póliza de seguro de responsabilidad civil."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA OCTAVA ═══════════
  h(2, [bu("OCTAVA: Confidencialidad")]),
  p([
    t("Ambas partes se obligan a mantener estricta confidencialidad sobre toda la información a la que tengan acceso con motivo de la ejecución del presente contrato. Esta obligación subsistirá aun después del término del contrato."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA NOVENA ═══════════
  h(2, [bu("NOVENA: Reajuste del Precio")]),
  p([
    t("El precio de los servicios se reajustará semestralmente de acuerdo a la variación del Índice de Precios al Consumidor (IPC) publicado por el Instituto Nacional de Estadísticas (INE), aplicándose el reajuste acumulado del período inmediatamente anterior."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA DÉCIMA ═══════════
  h(2, [bu("DÉCIMA: Término Anticipado")]),
  p([t("El presente contrato podrá terminar anticipadamente en los siguientes casos:")]),
  p([t("a) Por mutuo acuerdo de las partes, expresado por escrito.")]),
  p([t("b) Por incumplimiento grave de cualquiera de las obligaciones contenidas en el contrato, previa notificación por escrito con 30 días de anticipación.")]),
  p([t("c) Por quiebra, disolución o liquidación de cualquiera de las partes.")]),
  p([
    t("En caso de término anticipado por incumplimiento de EL CLIENTE, este deberá pagar a LA EMPRESA una indemnización equivalente al valor de los meses restantes del contrato, con un tope de 3 meses de servicio."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA UNDÉCIMA ═══════════
  h(2, [bu("UNDÉCIMA: Caso Fortuito o Fuerza Mayor")]),
  p([
    t("Ninguna de las partes será responsable por el incumplimiento de sus obligaciones cuando este se deba a caso fortuito o fuerza mayor, debidamente acreditado. La parte afectada deberá comunicar la situación a la otra dentro de las 48 horas siguientes a su ocurrencia."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA DUODÉCIMA ═══════════
  h(2, [bu("DUODÉCIMA: Modificaciones")]),
  p([
    t("Toda modificación al presente contrato deberá constar por escrito y ser firmada por ambas partes. Las modificaciones a la dotación o servicios se formalizarán mediante adendum al Anexo 1."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA DÉCIMA TERCERA ═══════════
  h(2, [bu("DÉCIMA TERCERA: Legislación Aplicable")]),
  p([
    t("El presente contrato se rige por la legislación chilena vigente, en particular por el Decreto Ley N° 3.607, su Reglamento, y las normas que lo complementen o modifiquen."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA DÉCIMA CUARTA ═══════════
  h(2, [bu("DÉCIMA CUARTA: Domicilio y Jurisdicción")]),
  p([
    t("Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la ciudad de Santiago y se someten a la jurisdicción de sus Tribunales Ordinarios de Justicia."),
  ]),
  emptyP(),

  // ═══════════ CLÁUSULA DÉCIMA QUINTA ═══════════
  h(2, [bu("DÉCIMA QUINTA: Personería")]),
  p([
    t("La personería de don "),
    tk("empresa.repLegalNombre"),
    t(" para representar a "),
    tk("empresa.razonSocial"),
    t(", consta en escritura pública de fecha _____, otorgada ante el Notario Público de Santiago, don _____."),
  ]),
  p([
    t("La personería de don(a) "),
    tk("account.legalRepresentativeName"),
    t(" para representar a "),
    tk("account.legalName"),
    t(", consta en escritura pública de fecha "),
    tk("account.notaryDate"),
    t(", otorgada ante "),
    tk("account.notaryName"),
    t("."),
  ]),
  emptyP(),

  // ═══════════ FIRMAS ═══════════
  hr(),
  h(2, [t("FIRMAS")]),
  emptyP(),
  p([
    t("_________________________________              _________________________________"),
  ]),
  p([
    b("       LA EMPRESA                                          EL CLIENTE"),
  ]),
  p([
    t("  "),
    signatureTk(1),
    t("                                      "),
    signatureTk(2),
  ]),
  emptyP(),
  emptyP(),

  // ═══════════════════════════════════════════════════════════
  // ANEXO 1 — NOTIFICACIÓN DE SERVICIO
  // ═══════════════════════════════════════════════════════════
  hr(),
  h(1, [bu("ANEXO 1 — NOTIFICACIÓN DE SERVICIO")]),
  emptyP(),

  p([
    b("Contrato: "),
    tk("contract.title"),
  ]),
  p([
    b("Cliente: "),
    tk("account.name"),
    t(" — "),
    tk("account.legalName"),
  ]),
  p([
    b("Vigencia: "),
    tk("contract.effectiveDate"),
    t(" al "),
    tk("contract.expirationDate"),
  ]),
  emptyP(),

  h(3, [bu("Instalaciones")]),
  p([tk("quote.installationsTable")]),
  emptyP(),

  h(3, [bu("Dotación Detallada")]),
  p([tk("quote.positionsTable")]),
  emptyP(),

  p([
    b("Resumen: "),
    tk("quote.dotacionResumen"),
  ]),
  emptyP(),

  h(3, [bu("Valor Mensual")]),
  p([
    t("Precio mensual neto: $"),
    tk("quote.salePriceMonthly"),
    t(" + IVA"),
  ]),
  p([
    t("Total guardias: "),
    tk("quote.totalGuards"),
  ]),
  p([
    t("Total posiciones: "),
    tk("quote.totalPositions"),
  ]),
  emptyP(),

  // Firmas Anexo 1
  p([
    t("_________________________________              _________________________________"),
  ]),
  p([
    b("       LA EMPRESA                                          EL CLIENTE"),
  ]),
  p([
    t("  "),
    signatureTk(1),
    t("                                      "),
    signatureTk(2),
  ]),
  emptyP(),
  emptyP(),

  // ═══════════════════════════════════════════════════════════
  // ANEXO 2 — NORMAS DEL PUESTO
  // ═══════════════════════════════════════════════════════════
  hr(),
  h(1, [bu("ANEXO 2 — NORMAS DEL PUESTO DE VIGILANCIA")]),
  emptyP(),

  h(3, [bu("1. Normas Generales de Conducta")]),
  p([t("El guardia de seguridad deberá:")]),
  p([t("a) Presentarse puntualmente a su turno, debidamente uniformado y con su credencial OS-10 vigente.")]),
  p([t("b) Mantener una actitud profesional, respetuosa y cortés con todas las personas.")]),
  p([t("c) Cumplir estrictamente con las rondas y puntos de control asignados.")]),
  p([t("d) Registrar todas las novedades en el libro de novedades y/o sistema digital.")]),
  p([t("e) Prohibido el consumo de alcohol, drogas o cualquier sustancia que altere su capacidad de desempeño.")]),
  p([t("f) Mantener confidencialidad absoluta sobre la información del cliente y las operaciones de seguridad.")]),
  emptyP(),

  h(3, [bu("2. Procedimiento de Control de Acceso")]),
  p([t("a) Verificar la identidad de toda persona que ingrese al recinto.")]),
  p([t("b) Registrar el ingreso y salida de visitantes en el sistema correspondiente.")]),
  p([t("c) Controlar el ingreso y salida de vehículos y materiales.")]),
  p([t("d) Negar el acceso a personas no autorizadas, reportando inmediatamente al supervisor.")]),
  emptyP(),

  h(3, [bu("3. Procedimiento ante Emergencias")]),
  p([t("a) En caso de emergencia, activar el protocolo correspondiente y notificar inmediatamente al supervisor y a los servicios de emergencia (Carabineros, Bomberos, Ambulancia).")]),
  p([t("b) Realizar la evacuación de las personas del recinto cuando sea necesario, conforme al plan de evacuación.")]),
  p([t("c) Preservar la escena del suceso y colaborar con las autoridades competentes.")]),
  p([t("d) Elaborar un informe detallado de los hechos dentro de las 2 horas siguientes al evento.")]),
  emptyP(),

  h(3, [bu("4. Uso de Equipos y Comunicaciones")]),
  p([t("a) Utilizar los equipos de comunicación exclusivamente para fines laborales.")]),
  p([t("b) Mantener la radio encendida y disponible durante toda la jornada.")]),
  p([t("c) Reportar cualquier falla o desperfecto en los equipos al supervisor.")]),
  p([t("d) Prohibido el uso de teléfono celular personal durante el servicio, salvo en casos de emergencia.")]),
  emptyP(),

  h(3, [bu("5. Rondas de Vigilancia")]),
  p([t("a) Efectuar las rondas de vigilancia conforme a la frecuencia y recorrido establecidos.")]),
  p([t("b) Registrar cada punto de control mediante el sistema de rondas digital.")]),
  p([t("c) Reportar cualquier anomalía, novedad o situación sospechosa detectada durante la ronda.")]),
  emptyP(),

  // Firmas Anexo 2
  p([
    t("_________________________________              _________________________________"),
  ]),
  p([
    b("       LA EMPRESA                                          EL CLIENTE"),
  ]),
  p([
    t("  "),
    signatureTk(1),
    t("                                      "),
    signatureTk(2),
  ]),
]);

/* ── Tokens used ── */

const tokensUsed = [
  // Empresa
  "empresa.razonSocial",
  "empresa.rut",
  "empresa.repLegalNombre",
  "empresa.repLegalRut",
  "empresa.direccion",
  "empresa.comuna",
  // Account
  "account.name",
  "account.legalName",
  "account.rut",
  "account.address",
  "account.commune",
  "account.legalRepresentativeName",
  "account.legalRepresentativeRut",
  "account.notaryName",
  "account.notaryDate",
  // Installation
  "installation.name",
  "installation.address",
  "installation.commune",
  // Contract
  "contract.title",
  "contract.effectiveDate",
  "contract.expirationDate",
  "contract.durationMonths",
  // Quote
  "quote.salePriceMonthly",
  "quote.salePriceUF",
  "quote.contractMonths",
  "quote.contractAmount",
  "quote.positionsTable",
  "quote.installationsTable",
  "quote.dotacionResumen",
  "quote.totalGuards",
  "quote.totalPositions",
  // Signature
  "signature.signer_1",
  "signature.signer_2",
];

/* ── Seed function ── */

export async function seedContractTemplate(tenantId: string, createdBy: string) {
  const existing = await prisma.docTemplate.findFirst({
    where: {
      tenantId,
      module: "crm",
      name: "Contrato Prestación Servicios de Vigilancia",
    },
  });

  if (existing) {
    console.log("  → Contract template already exists, updating...");
    await prisma.docTemplate.update({
      where: { id: existing.id },
      data: {
        content,
        tokensUsed,
        description:
          "Contrato completo de prestación de servicios de vigilancia privada. Incluye Anexo 1 (Notificación de Servicio) y Anexo 2 (Normas del Puesto).",
        updatedAt: new Date(),
      },
    });
    return existing.id;
  }

  const template = await prisma.docTemplate.create({
    data: {
      tenantId,
      name: "Contrato Prestación Servicios de Vigilancia",
      description:
        "Contrato completo de prestación de servicios de vigilancia privada. Incluye Anexo 1 (Notificación de Servicio) y Anexo 2 (Normas del Puesto).",
      content,
      module: "crm",
      category: "contrato_cliente",
      tokensUsed,
      isActive: true,
      isDefault: true,
      createdBy,
    },
  });

  console.log(`  → Contract template created: ${template.id}`);
  return template.id;
}

/* ── Standalone execution ── */

if (require.main === module) {
  const tenantId = process.argv[2];
  const createdBy = process.argv[3];

  if (!tenantId || !createdBy) {
    console.error("Usage: npx tsx prisma/seeds/seed-contract-template.ts <tenantId> <createdBy>");
    process.exit(1);
  }

  console.log("Seeding contract template...");
  seedContractTemplate(tenantId, createdBy)
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export async function archiveLegacyContractTemplate(tenantId: string) {
  const existing = await prisma.docTemplate.findFirst({
    where: {
      tenantId,
      module: "crm",
      name: "Contrato Prestación Servicios de Vigilancia",
    },
  });
  if (!existing) {
    console.log("  → Legacy template not found, skipping");
    return;
  }
  await prisma.docTemplate.update({
    where: { id: existing.id },
    data: {
      isActive: false,
      isDefault: false,
      description:
        (existing.description ?? "") +
        " [ARCHIVADO el " + new Date().toISOString().slice(0, 10) +
        " — reemplazado por Contrato de Servicio de Seguridad v2]",
      updatedAt: new Date(),
    },
  });
  console.log(`  → Legacy template archived: ${existing.id}`);
}
