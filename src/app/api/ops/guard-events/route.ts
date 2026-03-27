import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { EVENT_SUBTYPES } from "@/lib/guard-events";
import { resolveDocument, buildGuardiaEntityData, buildLaborEventEntityData, buildEmpresaEntityData, enrichGuardiaWithSalary } from "@/lib/docs/token-resolver";
import { openai } from "@/lib/openai";

/**
 * GET /api/ops/guard-events — List guard events
 * Query params: guardiaId (required), category, status
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const category = request.nextUrl.searchParams.get("category");
    const status = request.nextUrl.searchParams.get("status");

    const where: any = { tenantId: ctx.tenantId, guardiaId };
    if (category) where.category = category;
    if (status) where.status = status;

    const events = await prisma.opsGuardEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Enrich with creator names
    const userIds = [...new Set(events.map((e) => e.createdBy).filter(Boolean))];
    const users = userIds.length
      ? await prisma.admin.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const items = events.map((e) => ({
      ...e,
      attachments: (e.attachments as any[]) ?? [],
      metadata: (e.metadata as Record<string, unknown>) ?? {},
      vacationPaymentAmount: e.vacationPaymentAmount ? Number(e.vacationPaymentAmount) : null,
      pendingRemunerationAmount: e.pendingRemunerationAmount ? Number(e.pendingRemunerationAmount) : null,
      yearsOfServiceAmount: e.yearsOfServiceAmount ? Number(e.yearsOfServiceAmount) : null,
      substituteNoticeAmount: e.substituteNoticeAmount ? Number(e.substituteNoticeAmount) : null,
      totalSettlementAmount: e.totalSettlementAmount ? Number(e.totalSettlementAmount) : null,
      createdByName: userMap.get(e.createdBy) ?? null,
      approvedByName: e.approvedBy ? userMap.get(e.approvedBy) ?? null : null,
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing guard events:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los eventos laborales" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ops/guard-events — Create a guard event
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    const { guardiaId, category, subtype } = body;
    if (!guardiaId || !category || !subtype) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos: guardiaId, category, subtype" },
        { status: 400 },
      );
    }

    // Validate finiquito requires finiquitoDate
    if (category === "finiquito" && !body.finiquitoDate) {
      return NextResponse.json(
        { success: false, error: "Fecha de finiquito es requerida" },
        { status: 400 },
      );
    }

    // Validate ausencia requires startDate
    if (category === "ausencia" && !body.startDate) {
      return NextResponse.json(
        { success: false, error: "Fecha de inicio es requerida" },
        { status: 400 },
      );
    }

    const effectiveStatus = "approved" as const;

    const created = await prisma.opsGuardEvent.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId,
        category,
        subtype,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        totalDays: body.totalDays ?? null,
        finiquitoDate: body.finiquitoDate ? new Date(body.finiquitoDate) : null,
        causalDtCode: body.causalDtCode ?? null,
        causalDtLabel: body.causalDtLabel ?? null,
        vacationDaysPending: body.vacationDaysPending ?? null,
        vacationPaymentAmount: body.vacationPaymentAmount ?? null,
        pendingRemunerationAmount: body.pendingRemunerationAmount ?? null,
        yearsOfServiceAmount: body.yearsOfServiceAmount ?? null,
        substituteNoticeAmount: body.substituteNoticeAmount ?? null,
        totalSettlementAmount: body.totalSettlementAmount ?? null,
        reason: body.reason ?? null,
        internalNotes: body.internalNotes ?? null,
        attachments: body.attachments ?? [],
        status: effectiveStatus,
        createdBy: ctx.userId,
        approvedBy: ctx.userId,
        approvedAt: new Date(),
      },
    });

    // ── Side effects ──

    // Load guardia info for history logging
    const guardiaForHistory = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId },
      select: { lifecycleStatus: true, persona: { select: { firstName: true, lastName: true } } },
    });
    const guardiaFullName = guardiaForHistory
      ? `${guardiaForHistory.persona.firstName} ${guardiaForHistory.persona.lastName}`
      : "";

    // Ausencia → paint V/L/P on pauta mensual + clean pending attendance
    if (category === "ausencia" && created.startDate && created.endDate) {
      const subtypeDef = EVENT_SUBTYPES.ausencia.find((s) => s.value === subtype);
      const shiftCode = subtypeDef?.shiftCode;
      if (shiftCode) {
        await prisma.opsPautaMensual.updateMany({
          where: {
            tenantId: ctx.tenantId,
            plannedGuardiaId: guardiaId,
            date: { gte: created.startDate, lte: created.endDate },
            shiftCode: "T",
          },
          data: { shiftCode, guardEventId: created.id },
        });

        await prisma.opsAsistenciaDiaria.deleteMany({
          where: {
            tenantId: ctx.tenantId,
            plannedGuardiaId: guardiaId,
            date: { gte: created.startDate, lte: created.endDate },
            attendanceStatus: { in: ["pendiente", "ppc"] },
            lockedAt: null,
          },
        });
      }

      const subtypeLabel = EVENT_SUBTYPES.ausencia.find((s) => s.value === subtype)?.label ?? subtype;
      await prisma.opsGuardiaHistory.create({
        data: {
          tenantId: ctx.tenantId,
          guardiaId,
          eventType: "labor_event_created",
          newValue: {
            category: "ausencia",
            subtype,
            subtypeLabel,
            startDate: body.startDate,
            endDate: body.endDate,
            totalDays: body.totalDays,
            reason: body.reason,
          },
          reason: `${subtypeLabel}: ${body.startDate} al ${body.endDate} (${body.totalDays ?? "?"} días)${body.reason ? ` — ${body.reason}` : ""}`,
          createdBy: ctx.userId,
        },
      });
    }

    // Finiquito → mark guardia inactive, deactivate assignment, clean pauta, generate docs
    if (category === "finiquito" && body.finiquitoDate) {
      const finiquitoDateObj = new Date(body.finiquitoDate);

      await prisma.opsGuardia.update({
        where: { id: guardiaId },
        data: {
          terminatedAt: finiquitoDateObj,
          terminationReason: body.causalDtLabel ?? "Finiquito",
          lifecycleStatus: "inactivo",
        },
      });

      // Deactivate ALL active assignments (handles multiple assignments robustly)
      await prisma.opsAsignacionGuardia.updateMany({
        where: { guardiaId, tenantId: ctx.tenantId, isActive: true },
        data: {
          isActive: false,
          endDate: finiquitoDateObj,
          reason: "Finiquito",
        },
      });

      // Deactivate ALL active series for this guard
      await prisma.opsSerieAsignacion.updateMany({
        where: { guardiaId, tenantId: ctx.tenantId, isActive: true },
        data: { isActive: false, endDate: finiquitoDateObj },
      });

      // Clear pauta from day AFTER finiquito for ALL slots where this guard is planned
      const dayAfterFiniquito = new Date(finiquitoDateObj);
      dayAfterFiniquito.setUTCDate(dayAfterFiniquito.getUTCDate() + 1);

      await prisma.opsPautaMensual.updateMany({
        where: {
          tenantId: ctx.tenantId,
          plannedGuardiaId: guardiaId,
          date: { gte: dayAfterFiniquito },
        },
        data: { plannedGuardiaId: null },
      });

      // Auto-generate Carta de Aviso + Finiquito from templates
      try {
        await autoGenerateFiniquitoDocs(ctx.tenantId, ctx.userId, created.id, guardiaId);
      } catch (err) {
        console.error("[OPS] Error auto-generating finiquito docs (non-blocking):", err);
      }

      const previousStatus = guardiaForHistory?.lifecycleStatus ?? "contratado";
      await prisma.opsGuardiaHistory.create({
        data: {
          tenantId: ctx.tenantId,
          guardiaId,
          eventType: "lifecycle_changed",
          previousValue: { lifecycleStatus: previousStatus },
          newValue: { lifecycleStatus: "inactivo", from: previousStatus, to: "inactivo" },
          reason: `Finiquito — ${body.causalDtLabel ?? "Sin causal"} — Fecha: ${body.finiquitoDate}`,
          createdBy: ctx.userId,
        },
      });
    }

    // Amonestación → save pre-generated AI carta, or generate on the fly
    if (category === "amonestacion" && (body.aiGeneratedHtml || body.reason)) {
      try {
        if (body.aiGeneratedHtml) {
          await saveAmonestacionFromHtml(ctx.tenantId, ctx.userId, created.id, guardiaId, body.aiGeneratedHtml);
        } else {
          await autoGenerateAmonestacionDoc(ctx.tenantId, ctx.userId, created.id, guardiaId, body.reason);
        }
      } catch (err) {
        console.error("[OPS] Error saving amonestacion doc (non-blocking):", err);
      }

      await prisma.opsGuardiaHistory.create({
        data: {
          tenantId: ctx.tenantId,
          guardiaId,
          eventType: "labor_event_created",
          newValue: {
            category: "amonestacion",
            subtype: "amonestacion_escrita",
            date: body.startDate,
            reason: body.reason,
          },
          reason: `Amonestación escrita — ${body.reason ?? "Sin motivo"}`,
          createdBy: ctx.userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...created,
        attachments: (created.attachments as any[]) ?? [],
        metadata: (created.metadata as Record<string, unknown>) ?? {},
        vacationPaymentAmount: created.vacationPaymentAmount ? Number(created.vacationPaymentAmount) : null,
        pendingRemunerationAmount: created.pendingRemunerationAmount ? Number(created.pendingRemunerationAmount) : null,
        yearsOfServiceAmount: created.yearsOfServiceAmount ? Number(created.yearsOfServiceAmount) : null,
        substituteNoticeAmount: created.substituteNoticeAmount ? Number(created.substituteNoticeAmount) : null,
        totalSettlementAmount: created.totalSettlementAmount ? Number(created.totalSettlementAmount) : null,
        createdByName: null,
        approvedByName: null,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el evento laboral" },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════
//  AUTO-GENERATE DOCUMENTS
// ═══════════════════════════════════════════════════════════════

async function loadGuardiaForDoc(tenantId: string, guardiaId: string) {
  return prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    include: {
      persona: true,
      currentInstallation: { select: { name: true, address: true, commune: true, city: true } },
      bankAccounts: { where: { isDefault: true }, take: 1 },
      asignaciones: {
        where: { isActive: true },
        include: { puesto: { include: { cargo: { select: { name: true } } } } },
        take: 1,
        orderBy: { startDate: "desc" },
      },
    },
  });
}

async function loadEmpresaData(tenantId: string) {
  let rawEmpresa = await prisma.setting.findMany({
    where: { tenantId, key: { startsWith: `empresa:${tenantId}:` } },
  });
  if (rawEmpresa.length === 0) {
    rawEmpresa = await prisma.setting.findMany({
      where: { tenantId, key: { startsWith: "empresa." } },
    });
  }
  const empresaSettings = rawEmpresa.map((s) => ({
    key: s.key.includes(":") ? s.key.replace(`empresa:${tenantId}:`, "") : s.key,
    value: s.value,
  }));
  return buildEmpresaEntityData(empresaSettings);
}

async function generateDocFromTemplate(
  tenantId: string,
  userId: string,
  eventId: string,
  guardiaId: string,
  templateCategory: string,
) {
  const template = await prisma.docTemplate.findFirst({
    where: { tenantId, module: "payroll", category: templateCategory, isActive: true },
  });
  if (!template) return null;

  const guardia = await loadGuardiaForDoc(tenantId, guardiaId);
  if (!guardia) return null;

  const event = await prisma.opsGuardEvent.findFirst({ where: { id: eventId } });
  if (!event) return null;

  const empresaData = await loadEmpresaData(tenantId);
  const activeAssignment = (guardia as any).asignaciones?.[0];
  const cargoName = activeAssignment?.puesto?.cargo?.name ?? "Guardia de Seguridad";

  let guardiaData = buildGuardiaEntityData(guardia as any);
  guardiaData.cargo = cargoName;
  guardiaData = await enrichGuardiaWithSalary(guardiaData, guardia.id);

  const laborEventData = buildLaborEventEntityData(event as any);

  const { resolvedContent, tokenValues } = resolveDocument(template.content, {
    empresa: empresaData,
    guardia: guardiaData,
    labor_event: laborEventData,
  });

  const document = await prisma.document.create({
    data: {
      tenantId,
      templateId: template.id,
      title: `${template.name} — ${guardia.persona.firstName} ${guardia.persona.lastName}`,
      content: resolvedContent,
      tokenValues,
      module: template.module,
      category: template.category,
      status: "draft",
      createdBy: userId,
    },
  });

  await prisma.docAssociation.createMany({
    data: [
      { documentId: document.id, entityType: "ops_guardia", entityId: guardiaId, role: "primary" },
      { documentId: document.id, entityType: "guard_event", entityId: eventId, role: "source" },
    ],
  });

  return document;
}

async function autoGenerateFiniquitoDocs(tenantId: string, userId: string, eventId: string, guardiaId: string) {
  await generateDocFromTemplate(tenantId, userId, eventId, guardiaId, "carta_aviso_termino");
  await generateDocFromTemplate(tenantId, userId, eventId, guardiaId, "finiquito");
}

async function autoGenerateAmonestacionDoc(
  tenantId: string,
  userId: string,
  eventId: string,
  guardiaId: string,
  reason: string,
) {
  const guardia = await loadGuardiaForDoc(tenantId, guardiaId);
  if (!guardia) return;

  const fullName = `${guardia.persona.firstName} ${guardia.persona.lastName}`;
  const rut = guardia.persona.rut ?? "";
  const address = guardia.persona.addressFormatted ?? "";
  const commune = guardia.persona.commune ?? "";
  const email = guardia.persona.email ?? "";
  const phone = guardia.persona.phoneMobile ?? guardia.persona.phone ?? "";

  const prompt = `Genera una carta formal de amonestación escrita para un guardia de seguridad. La carta debe ser profesional, en español de Chile, y firmada por el representante legal de GARD SEGURIDAD LTDA.

Datos del guardia:
- Nombre completo: ${fullName}
- RUT: ${rut}
- Dirección: ${address}, ${commune}
- Email: ${email}
- Teléfono: ${phone}

Motivo de la amonestación:
${reason}

La carta debe incluir:
1. Fecha actual
2. Datos del destinatario (guardia)
3. Referencia: "Amonestación Escrita"
4. Cuerpo con los hechos que motivan la amonestación
5. Advertencia de que una reiteración puede derivar en sanciones mayores
6. Espacio para firma del representante legal (Jorge Andrés Montenegro Fuenzalida, RUT 13.051.246-1) y del trabajador
7. Pie: "GARD SEGURIDAD LTDA."

Responde SOLO con el HTML de la carta (sin explicaciones). Usa etiquetas HTML simples: <h1>, <h2>, <p>, <strong>, <br/>.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const htmlContent = completion.choices[0]?.message?.content ?? "";
  if (!htmlContent) return;

  const tiptapContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: htmlContent }] },
    ],
  };

  const document = await prisma.document.create({
    data: {
      tenantId,
      title: `Carta de Amonestación — ${fullName}`,
      content: tiptapContent,
      module: "payroll",
      category: "carta_amonestacion",
      status: "draft",
      createdBy: userId,
    },
  });

  await prisma.docAssociation.createMany({
    data: [
      { documentId: document.id, entityType: "ops_guardia", entityId: guardiaId, role: "primary" },
      { documentId: document.id, entityType: "guard_event", entityId: eventId, role: "source" },
    ],
  });
}

async function saveAmonestacionFromHtml(
  tenantId: string,
  userId: string,
  eventId: string,
  guardiaId: string,
  htmlContent: string,
) {
  const guardia = await loadGuardiaForDoc(tenantId, guardiaId);
  if (!guardia) return;

  const fullName = `${guardia.persona.firstName} ${guardia.persona.lastName}`;

  const tiptapContent = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: htmlContent }] },
    ],
  };

  const document = await prisma.document.create({
    data: {
      tenantId,
      title: `Carta de Amonestación — ${fullName}`,
      content: tiptapContent,
      module: "payroll",
      category: "carta_amonestacion",
      status: "draft",
      createdBy: userId,
    },
  });

  await prisma.docAssociation.createMany({
    data: [
      { documentId: document.id, entityType: "ops_guardia", entityId: guardiaId, role: "primary" },
      { documentId: document.id, entityType: "guard_event", entityId: eventId, role: "source" },
    ],
  });
}
