/**
 * Seed script: Creates a DocTemplate for "Contrato de Servicio" with 16 clauses.
 * Usage: npx tsx scripts/seed-contract-template.ts <TENANT_ID> <CREATED_BY_USER_ID>
 */

import { PrismaClient } from "@prisma/client";

const TENANT_ID = process.argv[2];
const CREATED_BY = process.argv[3] || "system";

if (!TENANT_ID) {
  console.error("Usage: npx tsx scripts/seed-contract-template.ts <TENANT_ID> [CREATED_BY]");
  process.exit(1);
}

// Helpers for building Tiptap JSON
function p(children: any[]): any {
  return { type: "paragraph", content: children };
}
function t(content: string): any {
  return { type: "text", text: content };
}
function bold(content: string): any {
  return { type: "text", text: content, marks: [{ type: "bold" }] };
}
function tk(tokenKey: string): any {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}
function h(level: number, children: any[]): any {
  return { type: "heading", attrs: { level }, content: children };
}
function hr(): any {
  return { type: "horizontalRule" };
}

// Build clause sections
const CLAUSES = [
  // PRIMERA — Objeto del Contrato
  h(2, [bold("PRIMERA: Objeto del Contrato")]),
  p([
    t('Por el presente contrato, '), tk("empresa.razonSocial"), t(', RUT '), tk("empresa.rut"),
    t(', en adelante "LA EMPRESA", se obliga a prestar servicios de seguridad y vigilancia privada al CLIENTE en las dependencias ubicadas en '),
    tk("installation.address"), t(', '), tk("installation.city"),
    t(', conforme a las condiciones que se estipulan en las cláusulas siguientes.'),
  ]),
  p([
    t('Los servicios incluyen la protección de personas, bienes muebles e inmuebles y la prevención de riesgos, mediante guardias de seguridad debidamente acreditados ante la autoridad competente (OS-10 de Carabineros de Chile), conforme al Decreto Ley N° 3.607 y su reglamento.'),
  ]),

  // SEGUNDA — Dotación y Horarios
  h(2, [bold("SEGUNDA: Dotación y Horarios de Servicio")]),
  p([
    t('LA EMPRESA pondrá a disposición del CLIENTE la siguiente dotación de personal de seguridad: '),
    tk("quote.dotacionResumen"), t('.'),
  ]),
  p([
    t('LA EMPRESA se reserva el derecho de efectuar rotación del personal asignado, garantizando en todo momento el cumplimiento de la dotación pactada y la calidad del servicio.'),
  ]),

  // TERCERA — Precio y Forma de Pago (CLP version — conditional at template level)
  h(2, [bold("TERCERA: Precio y Forma de Pago")]),
  p([
    t('El precio mensual por los servicios contratados asciende a '),
    tk("quote.precioNeto"), t(' (pesos chilenos) neto, más el Impuesto al Valor Agregado (IVA) correspondiente.'),
  ]),
  p([
    t('El CLIENTE pagará mensualmente dentro de los primeros '),
    tk("quote.paymentDays"), t(' días hábiles del mes siguiente al de la prestación del servicio, contra presentación de la factura respectiva.'),
  ]),
  p([
    t('El precio total del contrato por '), tk("quote.contractMonths"),
    t(' meses de vigencia asciende a '), tk("quote.precioTotal"), t(' neto más IVA.'),
  ]),
  p([
    t('La mora en el pago devengará un interés mensual equivalente al interés corriente vigente al momento de la mora, sin perjuicio del derecho de LA EMPRESA a suspender los servicios después de 30 días de atraso.'),
  ]),

  // CUARTA — Plazo y Vigencia
  h(2, [bold("CUARTA: Plazo y Vigencia")]),
  p([
    t('El presente contrato tendrá una duración de '), tk("quote.contractMonths"),
    t(' meses, contados desde el '), tk("quote.contractStartDate"),
    t(' hasta el '), tk("quote.contractEndDate"), t('.'),
  ]),
  p([
    t('El contrato se renovará automáticamente por períodos iguales y sucesivos, salvo que alguna de las partes comunique a la otra, por escrito y con al menos 60 (sesenta) días de anticipación al vencimiento del período respectivo, su voluntad de no renovarlo o de modificar sus condiciones.'),
  ]),

  // QUINTA — Obligaciones de LA EMPRESA
  h(2, [bold("QUINTA: Obligaciones de LA EMPRESA")]),
  p([
    t('LA EMPRESA se obliga a: a) Prestar los servicios de seguridad con personal debidamente capacitado y acreditado ante OS-10 de Carabineros; b) Cumplir con toda la normativa laboral, previsional y de seguridad social vigente respecto de su personal; c) Mantener un Libro de Novedades digital actualizado; d) Proveer al personal de los implementos necesarios (uniforme, equipamiento, credencial); e) Responder ante el CLIENTE por daños causados por negligencia comprobada de su personal; f) Mantener póliza de seguros de responsabilidad civil vigente durante todo el contrato.'),
  ]),

  // SEXTA — Obligaciones del CLIENTE
  h(2, [bold("SEXTA: Obligaciones del CLIENTE")]),
  p([
    t('El CLIENTE se obliga a: a) Pagar oportunamente el precio convenido; b) Proporcionar a los guardias las facilidades necesarias para el desempeño de sus funciones (garita, servicios sanitarios, acceso a comunicaciones); c) No impartir órdenes directas al personal de seguridad que contradigan los protocolos de LA EMPRESA; d) Informar oportunamente a LA EMPRESA de cualquier situación que pueda afectar la seguridad del recinto.'),
  ]),

  // SÉPTIMA — Responsabilidad y Seguros
  h(2, [bold("SÉPTIMA: Responsabilidad y Seguros")]),
  p([
    t('La responsabilidad total acumulada de LA EMPRESA bajo este contrato no podrá exceder el equivalente a '),
    tk("quote.liabilityMonths"), t(' meses del precio mensual del servicio.'),
  ]),
  p([
    t('LA EMPRESA mantendrá vigente una póliza de seguro de responsabilidad civil por un monto no inferior a '),
    tk("quote.insurancePolicyUF"), t(' UF, que cubra daños a terceros y al patrimonio del CLIENTE derivados de la acción u omisión del personal de seguridad.'),
  ]),
  p([
    t('LA EMPRESA no será responsable por daños causados por caso fortuito o fuerza mayor, ni por hechos delictuales perpetrados por terceros ajenos al servicio, salvo negligencia comprobada de su personal.'),
  ]),

  // OCTAVA — Confidencialidad
  h(2, [bold("OCTAVA: Confidencialidad")]),
  p([
    t('Ambas partes se obligan a mantener estricta confidencialidad respecto de toda información reservada o sensible a la que tengan acceso con motivo de la ejecución de este contrato. Esta obligación subsistirá por un período de 2 (dos) años contados desde la terminación del contrato, cualquiera sea su causa.'),
  ]),

  // NOVENA — Reajuste
  h(2, [bold("NOVENA: Reajuste del Precio")]),
  p([
    t('El precio del servicio será reajustado '), tk("quote.adjustmentFreq"),
    t('mente, de acuerdo al mecanismo de '), tk("quote.adjustmentType"), t('.'),
  ]),
  p([
    t('{{#if quote.polinomioDescripcion}}La fórmula de reajuste será un polinomio compuesto por '),
    t('{{quote.polinomioDescripcion}}'),
    t(', aplicado sobre el precio base vigente al inicio de cada período de reajuste.{{/if}}'),
  ]),
  p([
    t('El reajuste se aplicará de pleno derecho, sin necesidad de acuerdo adicional de las partes, a partir de la fecha en que se publiquen oficialmente los índices correspondientes. LA EMPRESA notificará al CLIENTE el nuevo precio reajustado con al menos 15 días de anticipación a su entrada en vigencia.'),
  ]),

  // DÉCIMA — Término Anticipado
  h(2, [bold("DÉCIMA: Término Anticipado")]),
  p([
    t('Cualquiera de las partes podrá poner término anticipado al contrato, sin expresión de causa, mediante aviso escrito con 60 (sesenta) días de anticipación. En caso de término anticipado por parte del CLIENTE sin cumplir el aviso previo, deberá pagar a LA EMPRESA una indemnización equivalente a 2 (dos) meses del precio mensual del servicio.'),
  ]),
  p([
    t('El contrato podrá terminarse de inmediato en caso de incumplimiento grave de las obligaciones esenciales por alguna de las partes, previa notificación por escrito, otorgando un plazo de 15 días para subsanar el incumplimiento.'),
  ]),

  // UNDÉCIMA — Caso Fortuito y Fuerza Mayor
  h(2, [bold("UNDÉCIMA: Caso Fortuito y Fuerza Mayor")]),
  p([
    t('Ninguna de las partes será responsable por el incumplimiento de sus obligaciones cuando éste sea consecuencia directa de eventos de caso fortuito o fuerza mayor, conforme a lo previsto en el artículo 45 del Código Civil. La parte afectada deberá notificar a la otra dentro de las 48 horas siguientes a la ocurrencia del hecho y acreditar razonablemente su existencia.'),
  ]),

  // DUODÉCIMA — Legislación Aplicable y Jurisdicción
  h(2, [bold("DUODÉCIMA: Legislación Aplicable y Jurisdicción")]),
  p([
    t('El presente contrato se rige por la legislación de la República de Chile, en particular el Decreto Ley N° 3.607 sobre seguridad privada, su Reglamento, y demás normas aplicables. Para todos los efectos legales derivados de este contrato, las partes fijan su domicilio en la ciudad de Santiago y se someten a la jurisdicción de sus Tribunales Ordinarios de Justicia.'),
  ]),

  // DÉCIMA TERCERA — CCTV y Protección de Datos
  h(2, [bold("DÉCIMA TERCERA: Sistemas CCTV y Protección de Datos Personales")]),
  p([
    t('En caso de que el servicio incluya la operación o monitoreo de sistemas de circuito cerrado de televisión (CCTV), las grabaciones se conservarán por un período mínimo de '),
    tk("quote.cctvRetentionDays"), t(' días corridos, conforme a la Ley N° 19.628 sobre Protección de la Vida Privada y la Ley N° 21.719 sobre Datos Personales.'),
  ]),
  p([
    t('Ambas partes se comprometen a cumplir con la normativa vigente en materia de protección de datos personales, limitando el tratamiento de la información capturada exclusivamente a fines de seguridad. LA EMPRESA no compartirá las grabaciones con terceros, salvo requerimiento de autoridad competente.'),
  ]),

  // DÉCIMA CUARTA — Subcontratación
  h(2, [bold("DÉCIMA CUARTA: Subcontratación y Cesión")]),
  p([
    t('LA EMPRESA podrá subcontratar parcialmente la ejecución de los servicios, previa autorización escrita del CLIENTE, manteniendo en todo caso su responsabilidad directa ante el CLIENTE por el cumplimiento de las obligaciones del presente contrato. La cesión total o parcial de los derechos y obligaciones de este contrato requerirá el consentimiento previo y por escrito de ambas partes.'),
  ]),

  // DÉCIMA QUINTA — Propiedad Intelectual
  h(2, [bold("DÉCIMA QUINTA: Propiedad Intelectual y Protocolos")]),
  p([
    t('Los protocolos de seguridad, procedimientos operativos y toda la documentación técnica desarrollada por LA EMPRESA en el marco de este contrato constituyen propiedad intelectual de LA EMPRESA y no podrán ser reproducidos, distribuidos ni utilizados por el CLIENTE para fines distintos a los del presente contrato, sin autorización previa y escrita.'),
  ]),

  // DÉCIMA SEXTA — Ejemplares y Firma
  h(2, [bold("DÉCIMA SEXTA: Ejemplares y Firma")]),
  p([
    t('El presente contrato se firma en dos ejemplares de igual tenor y fecha, quedando uno en poder de cada parte. Las partes declaran conocer y aceptar íntegramente las condiciones aquí estipuladas, firmando en señal de conformidad.'),
  ]),

  hr(),

  p([
    t('Por LA EMPRESA: '), tk("empresa.razonSocial"),
  ]),
  p([
    t('Representante Legal: '), tk("empresa.repLegalNombre"),
  ]),
  p([
    t('RUT: '), tk("empresa.repLegalRut"),
  ]),
  p([tk("signature.signer_1")]),

  hr(),

  p([
    t('Por EL CLIENTE: '), tk("account.legalName"),
  ]),
  p([
    t('Representante Legal: '), tk("account.legalRepresentativeName"),
  ]),
  p([
    t('RUT: '), tk("account.legalRepresentativeRut"),
  ]),
  p([tk("signature.signer_2")]),
];

const TEMPLATE_CONTENT = {
  type: "doc",
  content: [
    h(1, [bold("CONTRATO DE PRESTACIÓN DE SERVICIOS DE SEGURIDAD Y VIGILANCIA PRIVADA")]),
    p([
      t("En Santiago de Chile, a "), tk("system.todayLong"),
      t(", entre "), tk("empresa.razonSocial"), t(", RUT "), tk("empresa.rut"),
      t(", representada legalmente por don(a) "), tk("empresa.repLegalNombre"),
      t(", RUT "), tk("empresa.repLegalRut"),
      t(', con domicilio en '), tk("empresa.direccion"),
      t(', en adelante "LA EMPRESA"; y '),
      tk("account.legalName"), t(", RUT "), tk("account.rut"),
      t(", representada legalmente por don(a) "), tk("account.legalRepresentativeName"),
      t(", RUT "), tk("account.legalRepresentativeRut"),
      t(', en adelante "EL CLIENTE", se ha convenido el siguiente contrato de prestación de servicios de seguridad y vigilancia privada:'),
    ]),
    ...CLAUSES,
  ],
};

const TOKENS_USED = [
  "empresa.razonSocial", "empresa.rut", "empresa.direccion", "empresa.repLegalNombre", "empresa.repLegalRut",
  "account.legalName", "account.rut", "account.legalRepresentativeName", "account.legalRepresentativeRut",
  "installation.address", "installation.city",
  "quote.dotacionResumen", "quote.precioNeto", "quote.paymentDays", "quote.contractMonths", "quote.precioTotal",
  "quote.contractStartDate", "quote.contractEndDate", "quote.liabilityMonths", "quote.insurancePolicyUF",
  "quote.adjustmentFreq", "quote.adjustmentType", "quote.polinomioDescripcion", "quote.cctvRetentionDays",
  "system.todayLong",
  "signature.signer_1", "signature.signer_2",
];

async function main() {
  const prisma = new PrismaClient();

  // Check if template already exists
  const existing = await prisma.docTemplate.findFirst({
    where: {
      tenantId: TENANT_ID,
      module: "crm",
      category: "contrato_servicio",
      name: "Contrato de Servicio de Seguridad",
    },
  });

  if (existing) {
    console.log(`Template already exists: ${existing.id}. Updating content...`);
    await prisma.docTemplate.update({
      where: { id: existing.id },
      data: {
        content: TEMPLATE_CONTENT,
        tokensUsed: TOKENS_USED,
      },
    });
    console.log(`Updated template ${existing.id}`);
  } else {
    const template = await prisma.docTemplate.create({
      data: {
        tenantId: TENANT_ID,
        name: "Contrato de Servicio de Seguridad",
        description: "Contrato de prestación de servicios de seguridad y vigilancia privada — 16 cláusulas con tokens dinámicos de cotización CPQ.",
        content: TEMPLATE_CONTENT,
        module: "crm",
        category: "contrato_servicio",
        tokensUsed: TOKENS_USED,
        isActive: true,
        isDefault: true,
        createdBy: CREATED_BY,
      },
    });
    console.log(`Created template: ${template.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
