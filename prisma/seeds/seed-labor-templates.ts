/**
 * Seed: Templates de documentos laborales
 *
 * Crea templates para:
 * 1. Contrato de Trabajo
 * 2. Carta de Aviso de Término (Art. 162)
 * 3. Finiquito (Art. 177)
 *
 * Representante legal: Jorge Andrés Montenegro Fuenzalida, RUT 13.051.246-1
 * Logo: Gard (se inserta como imagen en el template)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEGAL_REP_NAME = "Jorge Andrés Montenegro Fuenzalida";
const LEGAL_REP_RUT = "13.051.246-1";

function buildTiptapDoc(blocks: any[]): any {
  return {
    type: "doc",
    content: blocks,
  };
}

function paragraph(children: any[], attrs?: any): any {
  return { type: "paragraph", content: children, attrs };
}

function text(content: string, marks?: any[]): any {
  return { type: "text", text: content, marks };
}

function bold(content: string): any {
  return text(content, [{ type: "bold" }]);
}

function token(tokenKey: string): any {
  return {
    type: "contractToken",
    attrs: { tokenKey, label: tokenKey },
  };
}

function heading(level: number, children: any[]): any {
  return { type: "heading", attrs: { level }, content: children };
}

function hardBreak(): any {
  return { type: "hardBreak" };
}

// ═══════════════════════════════════════════════════════════════
//  1. CONTRATO DE TRABAJO
// ═══════════════════════════════════════════════════════════════

const contratoTrabajo = buildTiptapDoc([
  heading(1, [bold("CONTRATO DE TRABAJO")]),
  paragraph([
    text("En Santiago, a "),
    token("system.todayLong"),
    text(", entre la empresa "),
    bold("GARD SEGURIDAD LTDA."),
    text(", RUT 77.XXX.XXX-X, representada legalmente por don "),
    bold(LEGAL_REP_NAME),
    text(`, RUT ${LEGAL_REP_RUT}, ambos domiciliados en [dirección empresa], en adelante "el Empleador", y don(a) `),
    token("guardia.fullName"),
    text(", RUT "),
    token("guardia.rut"),
    text(", domiciliado(a) en "),
    token("guardia.address"),
    text(", comuna de "),
    token("guardia.commune"),
    text(", ciudad de "),
    token("guardia.city"),
    text(`, en adelante "el Trabajador", se ha convenido el siguiente contrato de trabajo:`),
  ]),
  heading(2, [text("PRIMERO: Naturaleza de los servicios")]),
  paragraph([
    text("El Trabajador se compromete a prestar servicios como "),
    bold("Guardia de Seguridad"),
    text(", en la instalación "),
    token("guardia.currentInstallation"),
    text(", o en cualquier otra que el Empleador determine, dentro de la región."),
  ]),
  heading(2, [text("SEGUNDO: Lugar de prestación de servicios")]),
  paragraph([
    text("Los servicios se prestarán en "),
    token("guardia.currentInstallation"),
    text(", sin perjuicio de la facultad del Empleador de alterar la naturaleza de los servicios o el sitio o recinto en que ellos deban prestarse, con las limitaciones del artículo 12 del Código del Trabajo."),
  ]),
  heading(2, [text("TERCERO: Jornada de trabajo")]),
  paragraph([
    text("La jornada ordinaria de trabajo será de 45 horas semanales distribuidas de lunes a sábado, en horarios rotativos definidos por el Empleador según las necesidades del servicio."),
  ]),
  heading(2, [text("CUARTO: Remuneración")]),
  paragraph([
    text("El Trabajador percibirá una remuneración mensual bruta de $_______, pagadera por períodos vencidos el último día hábil de cada mes, mediante depósito en cuenta bancaria."),
  ]),
  paragraph([
    text("Banco: "), token("guardia.bankName"),
    text(" | Cuenta: "), token("guardia.bankAccountNumber"),
    text(" | Tipo: "), token("guardia.bankAccountType"),
  ]),
  heading(2, [text("QUINTO: Duración del contrato")]),
  paragraph([
    text("El presente contrato tendrá una duración desde el "),
    token("guardia.contractStartDate"),
    text(" hasta el "),
    token("guardia.contractEndDate"),
    text(". Si no se da aviso de término con la anticipación legal, o si el trabajador continúa prestando servicios con conocimiento del Empleador después de expirado el plazo, el contrato se entenderá por tiempo indefinido."),
  ]),
  heading(2, [text("SEXTO: Cotizaciones previsionales")]),
  paragraph([
    text("AFP: "), token("guardia.afp"), hardBreak(),
    text("Sistema de salud: "), token("guardia.healthSystem"),
  ]),
  heading(2, [text("SÉPTIMO: Ejemplares")]),
  paragraph([
    text("El presente contrato se firma en dos ejemplares, quedando uno en poder de cada parte contratante."),
  ]),
  paragraph([]),
  paragraph([]),
  paragraph([
    text("_____________________________"),
    text("                              "),
    text("_____________________________"),
  ]),
  paragraph([
    bold(LEGAL_REP_NAME),
    text("                  "),
    token("guardia.fullName"),
  ]),
  paragraph([
    text(`RUT ${LEGAL_REP_RUT}`),
    text("                                    "),
    text("RUT "), token("guardia.rut"),
  ]),
  paragraph([
    bold("EL EMPLEADOR"),
    text("                                      "),
    bold("EL TRABAJADOR"),
  ]),
]);

// ═══════════════════════════════════════════════════════════════
//  2. CARTA DE AVISO DE TÉRMINO (Art. 162)
// ═══════════════════════════════════════════════════════════════

const cartaAviso = buildTiptapDoc([
  heading(1, [bold("CARTA DE AVISO DE TÉRMINO DE CONTRATO")]),
  paragraph([text("(Artículo 162, Código del Trabajo)")]),
  paragraph([]),
  paragraph([
    text("Santiago, "),
    token("system.todayLong"),
  ]),
  paragraph([]),
  paragraph([
    text("Señor(a)"), hardBreak(),
    bold(""), token("guardia.fullName"), hardBreak(),
    text("RUT: "), token("guardia.rut"), hardBreak(),
    text("Domicilio: "), token("guardia.address"), text(", "), token("guardia.commune"), hardBreak(),
    text("Presente"),
  ]),
  paragraph([]),
  paragraph([
    text("De mi consideración:"),
  ]),
  paragraph([
    text("Por medio de la presente, y en conformidad con lo dispuesto en el artículo 162 del Código del Trabajo, comunico a usted que "),
    bold("GARD SEGURIDAD LTDA."),
    text(" ha resuelto poner término a su contrato de trabajo, en virtud de la causal contemplada en el "),
    bold(""), token("labor_event.causalDtArticle"),
    text(" del Código del Trabajo: "),
    bold("\""), token("labor_event.causalDtLabel"), bold("\""),
    text("."),
  ]),
  paragraph([
    text("La fecha efectiva de término de la relación laboral será el "),
    bold(""), token("labor_event.finiquitoDate"),
    text("."),
  ]),
  heading(2, [text("Hechos que fundamentan la causal")]),
  paragraph([
    token("labor_event.reason"),
  ]),
  heading(2, [text("Estado de cotizaciones previsionales")]),
  paragraph([
    text("Se informa que las cotizaciones previsionales se encuentran pagadas al día hasta el último día del mes anterior a la fecha de término."),
  ]),
  heading(2, [text("Indemnizaciones")]),
  paragraph([
    text("El monto total de las indemnizaciones que corresponden es de "),
    bold(""), token("labor_event.totalSettlementAmount"),
    text(", desglosado como sigue:"),
  ]),
  paragraph([
    text("- Vacaciones proporcionales: "), token("labor_event.vacationPaymentAmount"), hardBreak(),
    text("- Remuneración pendiente: "), token("labor_event.pendingRemunerationAmount"), hardBreak(),
    text("- Indemnización por años de servicio: "), token("labor_event.yearsOfServiceAmount"), hardBreak(),
    text("- Indemnización sustitutiva aviso previo: "), token("labor_event.substituteNoticeAmount"),
  ]),
  heading(2, [text("Modalidad del finiquito")]),
  paragraph([
    text("El finiquito será otorgado en forma presencial. El trabajador podrá optar por la suscripción electrónica a través del portal de la Dirección del Trabajo, lo cual es siempre facultativo."),
  ]),
  paragraph([
    text("Se remite copia de la presente a la Inspección del Trabajo correspondiente."),
  ]),
  paragraph([]),
  paragraph([
    text("Atentamente,"),
  ]),
  paragraph([]),
  paragraph([text("_____________________________")]),
  paragraph([bold(LEGAL_REP_NAME)]),
  paragraph([text(`RUT ${LEGAL_REP_RUT}`)]),
  paragraph([text("Representante Legal")]),
  paragraph([bold("GARD SEGURIDAD LTDA.")]),
]);

// ═══════════════════════════════════════════════════════════════
//  3. FINIQUITO (Art. 177)
// ═══════════════════════════════════════════════════════════════

const finiquitoTemplate = buildTiptapDoc([
  heading(1, [bold("FINIQUITO DE CONTRATO DE TRABAJO")]),
  paragraph([text("(Artículo 177, Código del Trabajo)")]),
  paragraph([]),
  paragraph([
    text("En Santiago, a "),
    token("system.todayLong"),
    text(", entre "),
    bold("GARD SEGURIDAD LTDA."),
    text(", RUT 77.XXX.XXX-X, representada legalmente por don "),
    bold(LEGAL_REP_NAME),
    text(`, RUT ${LEGAL_REP_RUT}, en adelante "el Empleador", y don(a) `),
    token("guardia.fullName"),
    text(", RUT "),
    token("guardia.rut"),
    text(", domiciliado(a) en "),
    token("guardia.address"),
    text(", comuna de "),
    token("guardia.commune"),
    text(`, en adelante "el Trabajador", se deja constancia de lo siguiente:`),
  ]),
  heading(2, [text("PRIMERO: Antecedentes de la relación laboral")]),
  paragraph([
    text("El Trabajador ingresó a prestar servicios para el Empleador con fecha "),
    token("guardia.hiredAt"),
    text(", desempeñándose como "),
    bold("Guardia de Seguridad"),
    text("."),
  ]),
  heading(2, [text("SEGUNDO: Causal de término")]),
  paragraph([
    text("La relación laboral termina por la causal contemplada en el "),
    token("labor_event.causalDtArticle"),
    text(" del Código del Trabajo: "),
    bold("\""), token("labor_event.causalDtLabel"), bold("\""),
    text(", con fecha efectiva "),
    token("labor_event.finiquitoDate"),
    text("."),
  ]),
  heading(2, [text("TERCERO: Pagos")]),
  paragraph([
    text("El Empleador paga al Trabajador las siguientes sumas:"),
  ]),
  paragraph([
    text("1. Vacaciones proporcionales ("),
    token("labor_event.vacationDaysPending"),
    text(" días): "),
    bold(""), token("labor_event.vacationPaymentAmount"), hardBreak(),
    text("2. Remuneración pendiente: "),
    bold(""), token("labor_event.pendingRemunerationAmount"), hardBreak(),
    text("3. Indemnización por años de servicio: "),
    bold(""), token("labor_event.yearsOfServiceAmount"), hardBreak(),
    text("4. Indemnización sustitutiva del aviso previo: "),
    bold(""), token("labor_event.substituteNoticeAmount"),
  ]),
  paragraph([
    bold("TOTAL A PAGAR: "),
    bold(""), token("labor_event.totalSettlementAmount"),
  ]),
  heading(2, [text("CUARTO: Declaración del trabajador")]),
  paragraph([
    text("El Trabajador declara que, con el pago de las sumas indicadas precedentemente, el Empleador nada le adeuda por concepto alguno derivado de la relación laboral que los unió, sea por remuneraciones, gratificaciones, horas extraordinarias, feriado legal o proporcional, indemnización por años de servicio, indemnización sustitutiva del aviso previo, ni por ningún otro concepto, renunciando expresamente a cualquier acción o derecho que pudiere corresponderle."),
  ]),
  heading(2, [text("QUINTO: Cotizaciones previsionales")]),
  paragraph([
    text("El Empleador declara que las cotizaciones previsionales se encuentran pagadas al día."),
  ]),
  heading(2, [text("SEXTO: Ejemplares y ratificación")]),
  paragraph([
    text("El presente finiquito se firma en tres ejemplares, quedando uno en poder de cada parte y el tercero para la Inspección del Trabajo. Las partes ratifican el presente finiquito ante ministro de fe."),
  ]),
  paragraph([]),
  paragraph([]),
  paragraph([
    text("_____________________________"),
    text("                              "),
    text("_____________________________"),
  ]),
  paragraph([
    bold(LEGAL_REP_NAME),
    text("                  "),
    token("guardia.fullName"),
  ]),
  paragraph([
    text(`RUT ${LEGAL_REP_RUT}`),
    text("                                    "),
    text("RUT "), token("guardia.rut"),
  ]),
  paragraph([
    bold("EL EMPLEADOR"),
    text("                                      "),
    bold("EL TRABAJADOR"),
  ]),
  paragraph([]),
  paragraph([text("_____________________________")]),
  paragraph([text("Ministro de Fe")]),
]);

// ═══════════════════════════════════════════════════════════════

const TEMPLATES = [
  {
    name: "Contrato de Trabajo — Guardia de Seguridad",
    description: "Contrato de trabajo estándar para guardias de seguridad. Incluye cláusulas de jornada, remuneración, duración y previsión.",
    content: contratoTrabajo,
    module: "payroll",
    category: "contrato_laboral",
    tokensUsed: [
      "system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address",
      "guardia.commune", "guardia.city", "guardia.currentInstallation",
      "guardia.contractStartDate", "guardia.contractEndDate",
      "guardia.bankName", "guardia.bankAccountNumber", "guardia.bankAccountType",
      "guardia.afp", "guardia.healthSystem",
    ],
    isDefault: true,
  },
  {
    name: "Carta de Aviso de Término",
    description: "Carta de aviso de término de contrato según Art. 162 del Código del Trabajo. Se envía por carta certificada al domicilio del trabajador y copia a la Inspección del Trabajo.",
    content: cartaAviso,
    module: "payroll",
    category: "carta_aviso_termino",
    tokensUsed: [
      "system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address",
      "guardia.commune", "labor_event.causalDtArticle", "labor_event.causalDtLabel",
      "labor_event.finiquitoDate", "labor_event.reason",
      "labor_event.totalSettlementAmount", "labor_event.vacationPaymentAmount",
      "labor_event.pendingRemunerationAmount", "labor_event.yearsOfServiceAmount",
      "labor_event.substituteNoticeAmount",
    ],
    isDefault: true,
  },
  {
    name: "Finiquito de Contrato de Trabajo",
    description: "Finiquito según Art. 177 del Código del Trabajo. Detalla causal, pagos, declaración del trabajador y ratificación ante ministro de fe.",
    content: finiquitoTemplate,
    module: "payroll",
    category: "finiquito",
    tokensUsed: [
      "system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address",
      "guardia.commune", "guardia.hiredAt",
      "labor_event.causalDtArticle", "labor_event.causalDtLabel",
      "labor_event.finiquitoDate", "labor_event.vacationDaysPending",
      "labor_event.vacationPaymentAmount", "labor_event.pendingRemunerationAmount",
      "labor_event.yearsOfServiceAmount", "labor_event.substituteNoticeAmount",
      "labor_event.totalSettlementAmount",
    ],
    isDefault: true,
  },
];

export async function seedLaborTemplates(tenantId: string, createdBy: string) {
  const results = [];

  for (const tpl of TEMPLATES) {
    const existing = await prisma.docTemplate.findFirst({
      where: { tenantId, module: tpl.module, name: tpl.name },
    });

    if (existing) {
      console.log(`  ⏭  Template "${tpl.name}" already exists, skipping`);
      results.push(existing);
      continue;
    }

    const created = await prisma.docTemplate.create({
      data: {
        tenantId,
        name: tpl.name,
        description: tpl.description,
        content: tpl.content,
        module: tpl.module,
        category: tpl.category,
        tokensUsed: tpl.tokensUsed,
        isActive: true,
        isDefault: tpl.isDefault,
        createdBy,
      },
    });

    console.log(`  ✅  Template "${tpl.name}" created (${created.id})`);
    results.push(created);
  }

  return results;
}

// Allow running directly
if (require.main === module) {
  const tenantId = process.argv[2];
  const createdBy = process.argv[3];

  if (!tenantId || !createdBy) {
    console.error("Usage: npx tsx prisma/seeds/seed-labor-templates.ts <tenantId> <createdBy>");
    process.exit(1);
  }

  seedLaborTemplates(tenantId, createdBy)
    .then((results) => {
      console.log(`\n${results.length} templates processed.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error seeding:", err);
      process.exit(1);
    });
}
