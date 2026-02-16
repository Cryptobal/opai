import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/docs/templates/seed-labor
 * Seeds the labor document templates (contrato, carta aviso, finiquito)
 * if they don't already exist for the tenant.
 */

const LEGAL_REP_NAME = "Jorge Andrés Montenegro Fuenzalida";
const LEGAL_REP_RUT = "13.051.246-1";

function text(content: string, marks?: any[]): any {
  return { type: "text", text: content, marks };
}
function bold(content: string): any {
  return text(content, [{ type: "bold" }]);
}
function token(tokenKey: string): any {
  return { type: "contractToken", attrs: { tokenKey, label: tokenKey } };
}
function paragraph(children: any[]): any {
  return { type: "paragraph", content: children };
}
function heading(level: number, children: any[]): any {
  return { type: "heading", attrs: { level }, content: children };
}
function hardBreak(): any {
  return { type: "hardBreak" };
}
function doc(blocks: any[]): any {
  return { type: "doc", content: blocks };
}

const TEMPLATES = [
  {
    name: "Contrato de Trabajo — Guardia de Seguridad",
    description: "Contrato de trabajo estándar para guardias.",
    module: "payroll",
    category: "contrato_laboral",
    isDefault: true,
    tokensUsed: ["empresa.razonSocial", "empresa.direccion", "empresa.comuna", "empresa.rut", "empresa.repLegalNombre", "empresa.repLegalRut", "system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address", "guardia.commune", "guardia.city", "guardia.cargo", "guardia.currentInstallation", "guardia.contractStartDate", "guardia.contractEndDate", "guardia.bankName", "guardia.bankAccountNumber", "guardia.bankAccountType", "guardia.afp", "guardia.healthSystem"],
    content: doc([
      heading(1, [bold("CONTRATO DE TRABAJO")]),
      paragraph([text("En Santiago, a "), token("system.todayLong"), text(", entre "), token("empresa.razonSocial"), text(", R.U.T. "), token("empresa.rut"), text(", representada por "), token("empresa.repLegalNombre"), text(", R.U.T. "), token("empresa.repLegalRut"), text(", domiciliada en "), token("empresa.direccion"), text(", y Don(ña) "), token("guardia.fullName"), text(", RUT "), token("guardia.rut"), text(", domiciliado en "), token("guardia.address"), text(", "), token("guardia.commune"), text(".")]),
      heading(2, [text("PRIMERO: Servicios")]),
      paragraph([text("El Trabajador prestará servicios como "), token("guardia.cargo"), text(" en "), token("guardia.currentInstallation"), text(".")]),
      heading(2, [text("SEGUNDO: Jornada")]),
      paragraph([text("Jornada de 45 horas semanales en turnos rotativos.")]),
      heading(2, [text("TERCERO: Remuneración")]),
      paragraph([text("Remuneración mensual bruta según acuerdo. Banco: "), token("guardia.bankName"), text(", Cuenta: "), token("guardia.bankAccountNumber"), text(".")]),
      heading(2, [text("CUARTO: Duración")]),
      paragraph([text("Desde "), token("guardia.contractStartDate"), text(" hasta "), token("guardia.contractEndDate"), text(".")]),
      heading(2, [text("QUINTO: Previsión")]),
      paragraph([text("AFP: "), token("guardia.afp"), text(". Salud: "), token("guardia.healthSystem"), text(".")]),
      paragraph([]),
      paragraph([text("_____________________________          _____________________________")]),
      paragraph([token("empresa.repLegalNombre"), text("     "), token("guardia.fullName")]),
      paragraph([text("RUT "), token("empresa.repLegalRut"), text("                                    RUT "), token("guardia.rut")]),
      paragraph([bold("EL EMPLEADOR"), text("                                  "), bold("EL TRABAJADOR")]),
    ]),
  },
  {
    name: "Carta de Aviso de Término",
    description: "Carta de aviso de término según Art. 162 del Código del Trabajo.",
    module: "payroll",
    category: "carta_aviso_termino",
    isDefault: true,
    tokensUsed: ["system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address", "guardia.commune", "labor_event.causalDtArticle", "labor_event.causalDtLabel", "labor_event.finiquitoDate", "labor_event.reason", "labor_event.totalSettlementAmount", "labor_event.vacationPaymentAmount", "labor_event.pendingRemunerationAmount", "labor_event.yearsOfServiceAmount", "labor_event.substituteNoticeAmount"],
    content: doc([
      heading(1, [bold("CARTA DE AVISO DE TÉRMINO DE CONTRATO")]),
      paragraph([text("(Artículo 162, Código del Trabajo)")]),
      paragraph([text("Santiago, "), token("system.todayLong")]),
      paragraph([text("Señor(a) "), token("guardia.fullName"), hardBreak(), text("RUT: "), token("guardia.rut"), hardBreak(), text("Domicilio: "), token("guardia.address"), text(", "), token("guardia.commune")]),
      paragraph([text("Por medio de la presente, "), token("empresa.razonSocial"), text(" comunica a usted que ha resuelto poner término a su contrato por la causal del "), token("labor_event.causalDtArticle"), text(": \""), token("labor_event.causalDtLabel"), text("\".")]),
      paragraph([text("Fecha efectiva de término: "), bold(""), token("labor_event.finiquitoDate"), text(".")]),
      heading(2, [text("Indemnizaciones")]),
      paragraph([text("Total: "), token("labor_event.totalSettlementAmount"), hardBreak(), text("- Vacaciones: "), token("labor_event.vacationPaymentAmount"), hardBreak(), text("- Remuneración: "), token("labor_event.pendingRemunerationAmount"), hardBreak(), text("- Años de servicio: "), token("labor_event.yearsOfServiceAmount"), hardBreak(), text("- Sustitutiva aviso: "), token("labor_event.substituteNoticeAmount")]),
      paragraph([text("Cotizaciones previsionales pagadas al día.")]),
      paragraph([]),
      paragraph([text("_____________________________")]),
      paragraph([bold(LEGAL_REP_NAME)]),
      paragraph([text(`RUT ${LEGAL_REP_RUT} — Representante Legal`)]),
    ]),
  },
  {
    name: "Finiquito de Contrato de Trabajo",
    description: "Finiquito según Art. 177 del Código del Trabajo. Formato DT con 5 cláusulas completas.",
    module: "payroll",
    category: "finiquito",
    isDefault: true,
    tokensUsed: ["empresa.ciudad", "empresa.razonSocial", "empresa.direccion", "empresa.comuna", "empresa.rut", "empresa.repLegalNombre", "empresa.repLegalRut", "guardia.fullName", "guardia.rut", "guardia.cargo", "guardia.hiredAt", "labor_event.finiquitoDate", "labor_event.lastWorkDay", "labor_event.causalDtArticle", "labor_event.causalDtLabel", "labor_event.vacationDaysPending", "labor_event.vacationPaymentAmount", "labor_event.pendingRemunerationAmount", "labor_event.yearsOfServiceAmount", "labor_event.substituteNoticeAmount", "labor_event.totalSettlementAmount"],
    content: doc([
      heading(1, [bold("FINIQUITO")]),
      paragraph([]),
      paragraph([text("En "), token("empresa.ciudad"), text(", a "), token("labor_event.finiquitoDate"), text(" entre "), token("empresa.razonSocial"), text(", con domicilio en "), token("empresa.direccion"), text(" Comuna de "), token("empresa.comuna"), text(", R.U.T. "), token("empresa.rut"), text(", representada por "), token("empresa.repLegalNombre"), text(" R.U.T. "), token("empresa.repLegalRut"), text(" de su mismo domicilio y Don(ña): "), token("guardia.fullName"), text(", C.I. "), token("guardia.rut"), text(".")]),
      paragraph([]),
      paragraph([bold("SE ACUERDA EL SIGUIENTE FINIQUITO")]),
      paragraph([]),
      paragraph([bold("1.- "), text("Don(ña) "), token("guardia.fullName"), text(", declara haberle prestado servicio a "), token("empresa.razonSocial"), text(", en calidad de "), token("guardia.cargo"), text(" desde el "), token("guardia.hiredAt"), text(" hasta el "), token("labor_event.lastWorkDay"), text(". Fecha esta última de terminación de sus servicios por la siguiente causa de acuerdo en lo dispuesto en el "), token("labor_event.causalDtArticle"), text(" Esto es: "), token("labor_event.causalDtLabel")]),
      paragraph([]),
      paragraph([bold("2.- "), text("Don(ña) "), token("guardia.fullName"), text(", declara recibir en este acto, a su entera satisfacción de parte de "), token("empresa.razonSocial"), text(", las sumas que a continuación se indican por los siguientes conceptos:")]),
      paragraph([text("Vacaciones proporcionales ("), token("labor_event.vacationDaysPending"), text(" días): "), token("labor_event.vacationPaymentAmount"), hardBreak(), text("Remuneración pendiente: "), token("labor_event.pendingRemunerationAmount"), hardBreak(), text("Indemnización por años de servicio: "), token("labor_event.yearsOfServiceAmount"), hardBreak(), text("Indemnización sustitutiva del aviso previo: "), token("labor_event.substituteNoticeAmount"), hardBreak(), hardBreak(), bold("TOTAL: "), token("labor_event.totalSettlementAmount")]),
      paragraph([]),
      paragraph([bold("3.- "), text("Don(ña) "), token("guardia.fullName"), text(", deja constancia que durante todo el tiempo que le prestó Servicios a la firma "), token("empresa.razonSocial"), text(", recibió de ésta, correcta y oportunamente el total de las remuneraciones convenidas de trabajo ejecutado, reajustes legales, pago de asignaciones familiares autorizadas, horas extraordinarias cuando las trabajó, feriados legales, cotizaciones previsionales, o participaciones que en conformidad a la Ley fueron procedentes y que nada se le adeuda por los conceptos antes indicados ni por ningún otro, sea de origen legal o contractual derivado de la prestación de sus servicios y motivo por el cual no teniendo reclamo ni cargo alguno que formular en contra de "), token("empresa.razonSocial"), text(", le otorga el más amplio y total finiquito.")]),
      paragraph([]),
      paragraph([bold("4.- RENUNCIA DE DERECHOS Y ACCIONES: "), text("El trabajador renuncia desde ya a toda reclamación, denuncia, demanda, acción o procedimiento judicial y extrajudicial, del fuero laboral, incluyendo acciones por accidentes laborales, administrativo y civil, en contra de su empleador, reconociendo que el pago que en este acto ha recibido ha servido, vale y es reconocido como suficiente transacción con autoridad de cosa juzgada.")]),
      paragraph([]),
      paragraph([bold("5.- LA EMPRESA DECLARA"), text(", en este acto bajo su responsabilidad legal, que don(ña) "), token("guardia.fullName"), text(", cédula de identidad Nº "), token("guardia.rut"), text(" no es deudor de pensión de alimentos, ni ha sido objeto de orden de Retención Judicial.")]),
      paragraph([]),
      paragraph([text("Por su parte, "), token("empresa.razonSocial"), text(" le informa y acredita el pago de la totalidad de las cotizaciones previsionales del trabajador.")]),
      paragraph([]),
      paragraph([]),
      paragraph([text("_____________________________          _____________________________")]),
      paragraph([token("empresa.repLegalNombre"), text("     "), token("guardia.fullName")]),
      paragraph([text("RUT "), token("empresa.repLegalRut"), text("                                    RUT "), token("guardia.rut")]),
      paragraph([bold("EL EMPLEADOR"), text("                                  "), bold("EL TRABAJADOR")]),
      paragraph([]),
      paragraph([text("_____________________________")]),
      paragraph([text("Ministro de Fe")]),
    ]),
  },
];

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const results = [];
    for (const tpl of TEMPLATES) {
      const existing = await prisma.docTemplate.findFirst({
        where: { tenantId: ctx.tenantId, module: tpl.module, name: tpl.name },
      });

      if (existing) {
        results.push({ name: tpl.name, status: "exists", id: existing.id });
        continue;
      }

      const created = await prisma.docTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          name: tpl.name,
          description: tpl.description,
          content: tpl.content,
          module: tpl.module,
          category: tpl.category,
          tokensUsed: tpl.tokensUsed,
          isActive: true,
          isDefault: tpl.isDefault,
          createdBy: ctx.userId,
        },
      });

      results.push({ name: tpl.name, status: "created", id: created.id });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[DOCS] Error seeding labor templates:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear los templates laborales" },
      { status: 500 }
    );
  }
}
