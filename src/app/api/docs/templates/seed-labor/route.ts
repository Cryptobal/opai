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
    tokensUsed: ["system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address", "guardia.commune", "guardia.city", "guardia.currentInstallation", "guardia.contractStartDate", "guardia.contractEndDate", "guardia.bankName", "guardia.bankAccountNumber", "guardia.bankAccountType", "guardia.afp", "guardia.healthSystem"],
    content: doc([
      heading(1, [bold("CONTRATO DE TRABAJO")]),
      paragraph([text("En Santiago, a "), token("system.todayLong"), text(", entre "), bold("GARD SEGURIDAD LTDA."), text(`, representada por ${LEGAL_REP_NAME}, RUT ${LEGAL_REP_RUT}, y `), token("guardia.fullName"), text(", RUT "), token("guardia.rut"), text(", domiciliado en "), token("guardia.address"), text(", "), token("guardia.commune"), text(".")]),
      heading(2, [text("PRIMERO: Servicios")]),
      paragraph([text("El Trabajador prestará servicios como Guardia de Seguridad en "), token("guardia.currentInstallation"), text(".")]),
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
      paragraph([bold(LEGAL_REP_NAME), text("     "), token("guardia.fullName")]),
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
      paragraph([text("Por medio de la presente, GARD SEGURIDAD LTDA. comunica a usted que ha resuelto poner término a su contrato por la causal del "), token("labor_event.causalDtArticle"), text(": \""), token("labor_event.causalDtLabel"), text("\".")]),
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
    description: "Finiquito según Art. 177 del Código del Trabajo.",
    module: "payroll",
    category: "finiquito",
    isDefault: true,
    tokensUsed: ["system.todayLong", "guardia.fullName", "guardia.rut", "guardia.address", "guardia.commune", "guardia.hiredAt", "labor_event.causalDtArticle", "labor_event.causalDtLabel", "labor_event.finiquitoDate", "labor_event.vacationDaysPending", "labor_event.vacationPaymentAmount", "labor_event.pendingRemunerationAmount", "labor_event.yearsOfServiceAmount", "labor_event.substituteNoticeAmount", "labor_event.totalSettlementAmount"],
    content: doc([
      heading(1, [bold("FINIQUITO DE CONTRATO DE TRABAJO")]),
      paragraph([text("(Artículo 177, Código del Trabajo)")]),
      paragraph([text("En Santiago, a "), token("system.todayLong"), text(`, entre GARD SEGURIDAD LTDA., representada por ${LEGAL_REP_NAME}, RUT ${LEGAL_REP_RUT}, y `), token("guardia.fullName"), text(", RUT "), token("guardia.rut"), text(", domiciliado en "), token("guardia.address"), text(", "), token("guardia.commune"), text(".")]),
      heading(2, [text("PRIMERO: Relación laboral")]),
      paragraph([text("El Trabajador ingresó el "), token("guardia.hiredAt"), text(" como Guardia de Seguridad.")]),
      heading(2, [text("SEGUNDO: Causal")]),
      paragraph([text("Término por "), token("labor_event.causalDtArticle"), text(": \""), token("labor_event.causalDtLabel"), text("\", con fecha "), token("labor_event.finiquitoDate"), text(".")]),
      heading(2, [text("TERCERO: Pagos")]),
      paragraph([text("1. Vacaciones ("), token("labor_event.vacationDaysPending"), text(" días): "), token("labor_event.vacationPaymentAmount"), hardBreak(), text("2. Remuneración pendiente: "), token("labor_event.pendingRemunerationAmount"), hardBreak(), text("3. Indemnización años servicio: "), token("labor_event.yearsOfServiceAmount"), hardBreak(), text("4. Sustitutiva aviso previo: "), token("labor_event.substituteNoticeAmount")]),
      paragraph([bold("TOTAL: "), token("labor_event.totalSettlementAmount")]),
      heading(2, [text("CUARTO: Declaración")]),
      paragraph([text("El Trabajador declara que con el pago indicado, el Empleador nada le adeuda por concepto alguno derivado de la relación laboral.")]),
      paragraph([]),
      paragraph([text("_____________________________          _____________________________")]),
      paragraph([bold(LEGAL_REP_NAME), text("     "), token("guardia.fullName")]),
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
