/**
 * Tools CPQ para el asistente IA — clone/margen/estado/puestos/propuesta/includes/envío portal.
 */
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import { prisma } from "@/lib/prisma";

import type { PreviewBackedToolName } from "@/lib/ai/dte-preview-cache";
import { consumePreview, storePreview } from "@/lib/ai/dte-preview-cache";
import type { RolePermissions } from "@/lib/permissions";

import {
  hcAiLog,
  hcCanCpqHardDelete,
  hcCanReadQuotes,
  hcCanWriteQuotes,
  hcMapQuoteResolveError,
  hcPickPositionId,
  hcPositionsOrdered,
  hcRolIdForSlot,
  hcSyncIncludesArray,
} from "@/lib/ai/help-chat-cpq-ai-shared";
import { resolveAiHelpChatCpqQuote } from "@/lib/ai/help-chat-ai-cpq-quote";
import { cloneCpqQuote } from "@/modules/cpq/clone-quote.service";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import {
  deleteQuotePosition,
  insertQuotePosition,
  patchQuotePosition,
  type InsertPositionBody,
} from "@/modules/cpq/quote-position-write.service";
import { updateCpqQuoteMargin } from "@/modules/cpq/update-quote-margin.service";
import { sendQuoteToPortal } from "@/modules/cpq/send/send-quote-to-portal";
import {
  resolveCargoId,
  pickDefaultCpqCatalogIds,
  resolvePuestoTrabajoId,
  resolveRolId,
  resolveRolPreferPattern,
} from "@/lib/cpq/ai-quote-catalog-resolve";
import type { ExpandedShiftSlot } from "@/lib/cpq/coverage-ai-expand";
import { expandCoveragePatternQuery } from "@/lib/cpq/coverage-ai-expand";
import { formatWeekdaysShort, normalizeWeekdays } from "@/lib/cpq/weekdays";
import { solveBaseSalaryFromNet } from "@/lib/cpq/solve-base-salary";
import { buildProposalProps } from "@/lib/pdf/templates/proposal/build-proposal-props";

const ALLOWED_QUOTE_STATUSES = new Set(["draft", "sent", "approved", "rejected"]);

type PageCx = HelpChatPageContext | null | undefined;

function asStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

async function previewFlow(
  toolName: PreviewBackedToolName,
  tenantId: string,
  userId: string,
  computed: Record<string, unknown>,
  args: Record<string, unknown>,
) {
  const token = storePreview({ tenantId, userId, toolName, args, computed });
  return {
    ok: true,
    data: {
      previewToken: token,
      expireMinutes: 5,
      reminder: `Confirma con la tool persistente ${toolName}; pasa previewToken y los mismos datos si el servidor reinició.`,
      ...computed,
    },
  };
}

function hcParseFollowUp(merged: Record<string, unknown>) {
  const skipAll = Boolean(merged.followUpSkipAll);
  const stageRaw =
    typeof merged.followUpTargetStageId === "string" && merged.followUpTargetStageId.trim()
      ? merged.followUpTargetStageId.trim()
      : null;

  const hasExplicitFollow =
    merged.followUpInclude !== undefined || stageRaw !== null || skipAll;
  if (!hasExplicitFollow) return undefined;

  const includeExplicit = merged.followUpInclude;
  const include = typeof includeExplicit === "boolean" ? includeExplicit : true;

  return { include, targetStageId: stageRaw, skipAll };
}

export async function aiTool_clone_quote(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({
      tenantId,
      userId,
      toolName: "clone_quote",
      args,
      status: "denied",
      errorMessage: "perm",
      startedAt: t0,
    });
    return { ok: false, error: "No tienes permiso para editar cotizaciones." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const nm = typeof args.newName === "string" && args.newName.trim() ? args.newName.trim() : undefined;
    const c = await cloneCpqQuote({ tenantId, sourceQuoteId: quote.id, overrideName: nm, createdBy: userId });
    await hcAiLog({
      tenantId,
      userId,
      toolName: "clone_quote",
      args,
      status: "success",
      resultEntityId: c.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    const meta = await prisma.cpqQuote.findFirst({
      where: { id: c.id, tenantId },
      select: { status: true, clientName: true, monthlyCost: true },
    });
    return {
      ok: true,
      data: {
        entityType: "cpq_quote",
        id: c.id,
        code: c.code,
        status: meta?.status ?? "draft",
        clientName: meta?.clientName ?? null,
        monthlyCost: meta ? Number(meta.monthlyCost) : null,
        url: `/crm/cotizaciones/${c.id}`,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const vr = ["QUOTE_REF_MISSING", "QUOTE_NOT_FOUND"].includes(raw);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "clone_quote",
      args,
      status: vr ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_update_quote_margin(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "update_quote_margin", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar cotizaciones." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const marginPctRaw = typeof args.marginPct === "number" ? args.marginPct : Number(args.marginPct);
    if (!Number.isFinite(marginPctRaw)) {
      await hcAiLog({ tenantId, userId, toolName: "update_quote_margin", args, status: "validation_error", errorMessage: "marginPct", startedAt: t0 });
      return { ok: false, error: "Indica marginPct como número (por ejemplo 22.5)." };
    }
    const marginMode = asStr(args, "marginMode");
    const { monthlyCost } = await updateCpqQuoteMargin({
      quoteId: quote.id,
      tenantId,
      marginPct: marginPctRaw,
      marginMode: marginMode ?? null,
    });
    const costs = await computeCpqQuoteCosts(quote.id);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_margin",
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        marginPct: marginPctRaw,
        monthlyCostSale: monthlyCost,
        preview: { monthlyTotal: costs.monthlyTotal, baseWithMargin: costs.baseWithMargin },
        url: `/crm/cotizaciones/${quote.id}`,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const vr = ["QUOTE_REF_MISSING", "QUOTE_NOT_FOUND"].includes(raw);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_margin",
      args,
      status: vr ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_update_quote_status(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "update_quote_status", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar cotizaciones." };
  }
  const st = typeof args.status === "string" ? args.status.trim().toLowerCase() : "";
  if (!ALLOWED_QUOTE_STATUSES.has(st)) {
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_status",
      args,
      status: "validation_error",
      errorMessage: "status invalid",
      startedAt: t0,
    });
    return { ok: false, error: `Estado inválido. Usa: ${Array.from(ALLOWED_QUOTE_STATUSES).join(", ")}.` };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    await prisma.cpqQuote.update({
      where: { id: quote.id, tenantId },
      data: { status: st },
    });
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_status",
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    return { ok: true, data: { quoteId: quote.id, status: st, url: `/crm/cotizaciones/${quote.id}` } };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const vr = ["QUOTE_REF_MISSING", "QUOTE_NOT_FOUND"].includes(raw);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_status",
      args,
      status: vr ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

async function buildInsertBodiesFromArgs(
  tenantId: string,
  args: Record<string, unknown>,
  defaults: Awaited<ReturnType<typeof pickDefaultCpqCatalogIds>>,
): Promise<InsertPositionBody[]> {
  const afpName = asStr(args, "afpName");
  const healthSystem = asStr(args, "healthSystem");
  const healthPlanPct = typeof args.healthPlanPct === "number" ? args.healthPlanPct : undefined;

  async function inferBaseSalary(): Promise<number> {
    const liqRaw = typeof args.targetNetMonthlyLiquid === "number" ? args.targetNetMonthlyLiquid : Number(args.targetNetMonthlyLiquid);
    if (typeof liqRaw === "number" && Number.isFinite(liqRaw) && liqRaw > 0) {
      const s = await solveBaseSalaryFromNet(liqRaw, {
        afpName: afpName || "modelo",
        healthSystem: healthSystem || "fonasa",
        healthPlanPct: healthPlanPct ?? undefined,
      });
      return Math.round(s.baseSalary);
    }
    const bs = typeof args.baseSalary === "number" ? args.baseSalary : Number(args.baseSalary);
    if (!Number.isFinite(bs) || bs <= 0) throw new Error("Falta baseSalary o targetNetMonthlyLiquid válido.");
    return Math.round(bs);
  }

  const baseSalary = await inferBaseSalary();
  let puestoId = await resolvePuestoTrabajoId(tenantId, asStr(args, "puestoTrabajoName"));
  let cargoId = await resolveCargoId(tenantId, asStr(args, "cargoName"));
  let fallbackRol = await resolveRolPreferPattern(tenantId, asStr(args, "rolName"));

  const cov = asStr(args, "coveragePattern");
  const expanded = cov ? expandCoveragePatternQuery(cov) : null;
  let slots: ExpandedShiftSlot[];
  if (expanded?.length) {
    slots = expanded;
  } else {
    const wkStrings = Array.isArray(args.weekdays)
      ? (args.weekdays as string[])
      : typeof args.weekdaysText === "string"
        ? args.weekdaysText.split(/[\s,;]+/).filter(Boolean)
        : [];
    slots = [
      {
        name: asStr(args, "slotLabel") ?? "Puesto",
        shiftStart: asStr(args, "startTime") ?? "08:00",
        shiftEnd: asStr(args, "endTime") ?? "18:00",
        daysOfWeek: normalizeWeekdays(wkStrings) as ExpandedShiftSlot["daysOfWeek"],
        guardsCount:
          typeof args.numGuards === "number"
            ? args.numGuards
            : typeof args.numGuards === "string"
              ? Number(args.numGuards)
              : undefined,
        rolShiftPattern: undefined,
      },
    ];
  }

  if (!fallbackRol?.id) fallbackRol = await resolveRolPreferPattern(tenantId, "");
  const rolFallbackId = fallbackRol?.id ?? defaults.rolId;

  const out: InsertPositionBody[] = [];
  const numPuestos =
    typeof args.numPuestos === "number" && Number.isFinite(args.numPuestos)
      ? Math.max(1, Math.trunc(args.numPuestos))
      : 1;

  for (const slot of slots) {
    const wk = normalizeWeekdays(slot.daysOfWeek ?? []);
    if (!wk.length) {
      throw new Error(
        "Días vacíos para un puesto. Usa weekdays (ej. Lun-Vie) o un coveragePattern reconocido (24/7, 5x2, etc.).",
      );
    }
    if (!puestoId) puestoId = defaults.puestoTrabajoId;
    if (!cargoId) cargoId = defaults.cargoId;
    const rolIdResolved = await hcRolIdForSlot(tenantId, slot, rolFallbackId, asStr(args, "rolName"));
    const numGuards = Math.max(
      1,
      Math.trunc(
        typeof slot.guardsCount === "number" && Number.isFinite(slot.guardsCount)
          ? slot.guardsCount
          : typeof args.numGuards === "number"
            ? args.numGuards
            : Number(args.numGuards) || 1,
      ),
    );
    const customName =
      slots.length > 1 ? `${asStr(args, "puestoLabelPrefix") ?? "Puesto"} · ${slot.name}` : asStr(args, "customName");

    out.push({
      puestoTrabajoId: puestoId,
      weekdays: wk,
      startTime: slot.shiftStart ?? "08:00",
      endTime: slot.shiftEnd ?? "18:00",
      numGuards,
      numPuestos,
      cargoId,
      rolId: rolIdResolved,
      baseSalary,
      afpName: afpName || "modelo",
      healthSystem: healthSystem || "fonasa",
      healthPlanPct: healthPlanPct ?? null,
      customName: customName ?? null,
      description: asStr(args, "description") ?? null,
    });
  }

  return out;
}

export async function aiTool_add_quote_position(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "add_quote_position", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para editar cotizaciones." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const defaults = await pickDefaultCpqCatalogIds(tenantId);
    let bodies = await buildInsertBodiesFromArgs(tenantId, args, defaults);

    const forceSingle = Boolean(args.forceSingleSlot);
    if (forceSingle && bodies.length > 1) bodies = bodies.slice(0, 1);

    const created: string[] = [];
    for (const body of bodies) {
      await insertQuotePosition({ quoteId: quote.id, tenantId, userId, body });
      const last = await prisma.cpqPosition.findFirst({
        where: { quoteId: quote.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (last) created.push(last.id);
    }
    await hcAiLog({
      tenantId,
      userId,
      toolName: "add_quote_position",
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    const pmap = await hcPositionsOrdered(quote.id);
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        addedPositionIds: created,
        positions: pmap,
        url: `/crm/cotizaciones/${quote.id}`,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const vr = ["QUOTE_REF_MISSING", "QUOTE_NOT_FOUND"].includes(raw);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "add_quote_position",
      args,
      status: vr || raw.includes("baseSalary") ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: raw.includes("QUOTE_") ? hcMapQuoteResolveError(e) : raw };
  }
}

export async function aiTool_preview_update_quote_position(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "preview_update_quote_position", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const pmap = await hcPositionsOrdered(quote.id);
    const positionId = hcPickPositionId(pmap, args);
    if (!positionId) {
      await hcAiLog({ tenantId, userId, toolName: "preview_update_quote_position", args, status: "validation_error", errorMessage: "position", startedAt: t0 });
      return {
        ok: false,
        error: `Indica positionId o positionIndex 1-${pmap.length} o positionNameSnippet.`,
        data: { positions: pmap },
      };
    }

    const body: Record<string, unknown> = {};
    const allowed = ["customName","description","weekdays","startTime","endTime","numGuards","numPuestos","cargoId","rolId","puestoTrabajoId","baseSalary","afpName","healthSystem","healthPlanPct"];
    for (const k of allowed) if (args[k] !== undefined) body[k] = args[k];

    const posBefore = await prisma.cpqPosition.findFirst({
      where: { id: positionId, quoteId: quote.id },
      include: { puestoTrabajo: true },
    });

    await hcAiLog({ tenantId, userId, toolName: "preview_update_quote_position", args, status: "success", startedAt: t0 });

    const tokenArgs = {
      quoteIdOrCode: quote.id,
      positionId,
      patch: body,
    };
    const summary = {
      quoteId: quote.id,
      positionId,
      positionLabel:
        posBefore?.customName?.trim() ||
        posBefore?.puestoTrabajo?.name ||
        pmap.find((p) => p.id === positionId)?.nombre,
      antes: posBefore ?
        {
          coverage: `${formatWeekdaysShort(posBefore.weekdays)} ${posBefore.startTime}-${posBefore.endTime}`,
          guards: posBefore.numGuards,
          baseSalary: Number(posBefore.baseSalary),
        }
      : null,
      patch: body,
    };
    return await previewFlow("update_quote_position", tenantId, userId, summary as unknown as Record<string, unknown>, tokenArgs);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({ tenantId, userId, toolName: "preview_update_quote_position", args, status: "internal_error", errorMessage: raw, startedAt: t0 });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

async function hydratePositionPatch(tenantId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out = { ...patch };
  const cn = out.cargoName;
  if (typeof cn === "string" && cn.trim() && !out.cargoId) {
    const id = await resolveCargoId(tenantId, cn);
    if (!id) throw new Error(`No encontré cargo: ${cn}`);
    out.cargoId = id;
    delete out.cargoName;
  }
  const rn = out.rolName;
  if (typeof rn === "string" && rn.trim() && !out.rolId) {
    const byNm = await resolveRolId(tenantId, rn);
    const byPref = await resolveRolPreferPattern(tenantId, rn);
    const idResolved = byNm ?? byPref?.id;
    if (!idResolved) throw new Error(`No encontré rol: ${rn}`);
    out.rolId = idResolved;
    delete out.rolName;
  }
  const pn = out.puestoTrabajoName;
  if (typeof pn === "string" && pn.trim() && !out.puestoTrabajoId) {
    const id = await resolvePuestoTrabajoId(tenantId, pn);
    if (!id) throw new Error(`No encontré puesto de trabajo: ${pn}`);
    out.puestoTrabajoId = id;
    delete out.puestoTrabajoName;
  }
  if (Array.isArray(out.weekdays)) {
    const nw = normalizeWeekdays(out.weekdays as string[]);
    if (!nw.length) throw new Error("weekdays vacío después de normalizar.");
    out.weekdays = nw;
  }
  return out;
}

function mergeArgsIntoPatch(args: Record<string, unknown>): Record<string, unknown> {
  const patch =
    typeof args.patch === "object" && args.patch && !Array.isArray(args.patch) ? ({ ...(args.patch as object) } as Record<string, unknown>) : {};
  const allowed = [
    "customName",
    "description",
    "weekdays",
    "startTime",
    "endTime",
    "numGuards",
    "numPuestos",
    "cargoId",
    "rolId",
    "puestoTrabajoId",
    "baseSalary",
    "afpName",
    "healthSystem",
    "healthPlanPct",
    "forceRecalculate",
    "cargoName",
    "rolName",
    "puestoTrabajoName",
  ];
  for (const k of allowed) {
    if (args[k] !== undefined && patch[k] === undefined) patch[k] = args[k];
  }
  return patch;
}

export async function aiTool_update_quote_position(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "update_quote_position", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso." };
  }

  try {
    const tok = typeof args.previewToken === "string" ? args.previewToken.trim() : "";
    let baseArgs = args;
    if (tok) {
      const p = consumePreview(tok, tenantId, userId, "update_quote_position");
      if (p) baseArgs = { ...(p.args as Record<string, unknown>), ...args };
    }

    let quoteUuid: string;
    try {
      quoteUuid = (await resolveAiHelpChatCpqQuote(tenantId, asStr(baseArgs, "quoteIdOrCode"), pageContext)).id;
    } catch (e) {
      await hcAiLog({
        tenantId,
        userId,
        toolName: "update_quote_position",
        args,
        status: "validation_error",
        errorMessage: hcMapQuoteResolveError(e),
        startedAt: t0,
      });
      return { ok: false, error: hcMapQuoteResolveError(e) };
    }

    let positionId =
      typeof baseArgs.positionId === "string" ?
        baseArgs.positionId.trim()
      : "";
    let patchRaw = mergeArgsIntoPatch(baseArgs);
    if (!positionId) {
      const pmap = await hcPositionsOrdered(quoteUuid);
      positionId = hcPickPositionId(pmap, baseArgs) ?? "";
      if (!positionId) {
        await hcAiLog({
          tenantId,
          userId,
          toolName: "update_quote_position",
          args,
          status: "validation_error",
          errorMessage: "position missing",
          startedAt: t0,
        });
        return { ok: false, error: "Falta positionId o índice de puesto válido.", data: { quoteId: quoteUuid } };
      }
    }

    patchRaw = await hydratePositionPatch(tenantId, patchRaw);
    if (Object.keys(patchRaw).length === 0) {
      await hcAiLog({
        tenantId,
        userId,
        toolName: "update_quote_position",
        args,
        status: "validation_error",
        errorMessage: "empty patch",
        startedAt: t0,
      });
      return { ok: false, error: "Sin cambios: indica campos a actualizar o reenvía previewToken." };
    }

    await patchQuotePosition({
      quoteId: quoteUuid,
      tenantId,
      userId,
      positionId,
      body: patchRaw,
    });
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_position",
      args,
      status: "success",
      resultEntityId: quoteUuid,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    const pmap = await hcPositionsOrdered(quoteUuid);
    return {
      ok: true,
      data: {
        quoteId: quoteUuid,
        positionId,
        positions: pmap,
        url: `/crm/cotizaciones/${quoteUuid}`,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "update_quote_position",
      args,
      status: raw === "POSITION_NOT_FOUND" ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    if (raw === "POSITION_NOT_FOUND") return { ok: false, error: "El puesto no existe en esa cotización." };
    return { ok: false, error: raw };
  }
}

export async function aiTool_preview_remove_quote_position(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanCpqHardDelete(perms)) {
    await hcAiLog({
      tenantId,
      userId,
      toolName: "preview_remove_quote_position",
      args,
      status: "denied",
      errorMessage: "perm",
      startedAt: t0,
    });
    return { ok: false, error: "Necesitas permiso CPQ nivel eliminar para borrar puestos (igual que el botón Eliminar)." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const pmap = await hcPositionsOrdered(quote.id);
    const positionId = hcPickPositionId(pmap, args);
    if (!positionId) {
      await hcAiLog({
        tenantId,
        userId,
        toolName: "preview_remove_quote_position",
        args,
        status: "validation_error",
        errorMessage: "position",
        startedAt: t0,
      });
      return { ok: false, error: "Indica el puesto a eliminar.", data: { positions: pmap } };
    }
    const pos = await prisma.cpqPosition.findFirst({
      where: { id: positionId, quoteId: quote.id },
      include: { puestoTrabajo: true },
    });
    const summary = {
      quoteId: quote.id,
      positionId,
      positionLabel:
        pos?.customName?.trim() || pos?.puestoTrabajo?.name || pmap.find((p) => p.id === positionId)?.nombre,
      coverage:
        pos ? `${formatWeekdaysShort(pos.weekdays)} ${pos.startTime}-${pos.endTime}` : null,
      warning:
        pmap.length <= 1
          ? "Quedará una cotización sin puestos: verifica antes de confirmar."
        : undefined,
    };
    const tokenArgs = { quoteIdOrCode: quote.id, positionId };
    await hcAiLog({ tenantId, userId, toolName: "preview_remove_quote_position", args, status: "success", startedAt: t0 });
    return await previewFlow("remove_quote_position", tenantId, userId, summary as Record<string, unknown>, tokenArgs);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "preview_remove_quote_position",
      args,
      status: "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_remove_quote_position(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanCpqHardDelete(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "remove_quote_position", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para eliminar puestos en CPQ." };
  }
  try {
    const tok = typeof args.previewToken === "string" ? args.previewToken.trim() : "";
    let merged = args;
    if (tok) {
      const p = consumePreview(tok, tenantId, userId, "remove_quote_position");
      if (p) merged = { ...(p.args as Record<string, unknown>), ...args };
    }
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(merged, "quoteIdOrCode"), pageContext);
    let positionId =
      typeof merged.positionId === "string" ? merged.positionId.trim() : "";
    if (!positionId) positionId = hcPickPositionId(await hcPositionsOrdered(quote.id), merged) ?? "";
    if (!positionId) {
      await hcAiLog({
        tenantId,
        userId,
        toolName: "remove_quote_position",
        args,
        status: "validation_error",
        errorMessage: "position missing",
        startedAt: t0,
      });
      return { ok: false, error: "Falta positionId." };
    }
    await deleteQuotePosition({ quoteId: quote.id, tenantId, userId, positionId });
    await hcAiLog({
      tenantId,
      userId,
      toolName: "remove_quote_position",
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        removedPositionId: positionId,
        positionsRemaining: await hcPositionsOrdered(quote.id),
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "remove_quote_position",
      args,
      status: raw === "POSITION_NOT_FOUND" ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_get_quote_proposal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanReadQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "get_quote_proposal", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para ver cotizaciones." };
  }
  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const props = await buildProposalProps(quote.id, tenantId);
    await hcAiLog({ tenantId, userId, toolName: "get_quote_proposal", args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });

    const itemsLite = props.items.slice(0, 30).map((it) => ({
      index: it.index,
      description: it.description,
      quantity: it.quantity,
      subtotalFormatted: it.subtotalFormatted,
    }));

    return {
      ok: true,
      data: {
        quotationCode: props.quotationCode,
        companyName: props.companyName,
        contactName: props.contactName,
        installationName: props.installationName,
        staffingCount: props.staffingCount,
        currency: props.currency,
        totalNetoFormatted: props.totalNetoFormatted,
        paymentTerms: props.paymentTerms,
        validUntil: props.validUntil ?? null,
        includedItemsPdf: props.includedItems ?? [],
        itemsPreview: itemsLite,
        itemsTotal: props.items.length,
        pdfUrlRelative: `/api/cpq/quotes/${quote.id}/proposal-pdf`,
        fileNameSuggestion: `${props.quotationCode}-propuesta`,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({ tenantId, userId, toolName: "get_quote_proposal", args, status: "internal_error", errorMessage: raw, startedAt: t0 });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_manage_quote_includes(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "manage_quote_includes", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso." };
  }
  const action = typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
  const allowedActs = new Set(["list", "add", "remove", "toggle_show_pdf"]);

  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const rowsBase = async () =>
      prisma.cpqQuoteIncludesItem.findMany({
        where: { quoteId: quote.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, text: true, showInPdf: true, sortOrder: true },
      });

    if (action === "list") {
      const rows = await rowsBase();
      await hcAiLog({ tenantId, userId, toolName: "manage_quote_includes", args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
      return { ok: true, data: { quoteId: quote.id, includes: rows } };
    }

    if (!allowedActs.has(action)) {
      await hcAiLog({ tenantId, userId, toolName: "manage_quote_includes", args, status: "validation_error", errorMessage: "action", startedAt: t0 });
      return {
        ok: false,
        error: "Acción inválida. Usa action: list | add | remove | toggle_show_pdf",
      };
    }

    if (action === "add") {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      if (!text) {
        await hcAiLog({
          tenantId,
          userId,
          toolName: "manage_quote_includes",
          args,
          status: "validation_error",
          errorMessage: "text",
          startedAt: t0,
        });
        return { ok: false, error: "Indica text." };
      }
      const agg = await prisma.cpqQuoteIncludesItem.aggregate({ where: { quoteId: quote.id }, _max: { sortOrder: true } });
      const nextOrd = Number(agg._max.sortOrder ?? 0) + 1;
      const showInPdf = typeof args.showInPdf === "boolean" ? args.showInPdf : true;
      const row = await prisma.cpqQuoteIncludesItem.create({
        data: {
          quoteId: quote.id,
          text,
          sortOrder: nextOrd,
          showInPdf,
          source: "custom",
        },
      });
      await hcSyncIncludesArray(quote.id);
      await hcAiLog({
        tenantId,
        userId,
        toolName: "manage_quote_includes",
        args,
        status: "success",
        resultEntityId: quote.id,
        resultEntityType: "cpq_quote",
        startedAt: t0,
      });
      const rows = await rowsBase();
      return { ok: true, data: { quoteId: quote.id, created: row.id, includes: rows } };
    }

    let itemId = typeof args.itemId === "string" ? args.itemId.trim() : "";
    const textSnip = typeof args.textSnippet === "string" ? args.textSnippet.trim().toLowerCase() : "";

    async function resolveItemIdStrict(): Promise<string | null> {
      if (itemId) return itemId;
      if (!textSnip) return null;
      const all = await rowsBase();
      const hits = all.filter((x) => x.text.toLowerCase().includes(textSnip));
      if (hits.length === 1) return hits[0].id;
      if (hits.length === 0) throw new Error("No encontré un ítem con ese texto.");
      throw new Error("Varios ítems coinciden; indica itemId UUID.");
    }

    if (action === "remove") {
      itemId = (await resolveItemIdStrict()) ?? "";
      if (!itemId) {
        await hcAiLog({
          tenantId,
          userId,
          toolName: "manage_quote_includes",
          args,
          status: "validation_error",
          errorMessage: "id",
          startedAt: t0,
        });
        return { ok: false, error: "Indica itemId o textSnippet único para borrar." };
      }
      await prisma.cpqQuoteIncludesItem.deleteMany({ where: { id: itemId, quoteId: quote.id } }).then((r) => {
        if (r.count !== 1) throw new Error("Ítem no encontrado.");
      });
      await hcSyncIncludesArray(quote.id);
      await hcAiLog({
        tenantId,
        userId,
        toolName: "manage_quote_includes",
        args,
        status: "success",
        resultEntityId: quote.id,
        resultEntityType: "cpq_quote",
        startedAt: t0,
      });
      return { ok: true, data: { quoteId: quote.id, deleted: itemId, includes: await rowsBase() } };
    }

    if (action === "toggle_show_pdf") {
      const showNext = typeof args.showInPdf === "boolean" ? args.showInPdf : null;
      if (showNext === null) {
        await hcAiLog({
          tenantId,
          userId,
          toolName: "manage_quote_includes",
          args,
          status: "validation_error",
          errorMessage: "showInPdf",
          startedAt: t0,
        });
        return { ok: false, error: "Indica showInPdf (true|false) junto al ítem." };
      }
      itemId = (await resolveItemIdStrict()) ?? "";
      if (!itemId) {
        await hcAiLog({
          tenantId,
          userId,
          toolName: "manage_quote_includes",
          args,
          status: "validation_error",
          errorMessage: "id",
          startedAt: t0,
        });
        return { ok: false, error: "Indica itemId o textSnippet único." };
      }
      const u = await prisma.cpqQuoteIncludesItem.updateMany({
        where: { id: itemId, quoteId: quote.id },
        data: { showInPdf: showNext },
      });
      if (u.count !== 1) throw new Error("Ítem no encontrado.");
      await hcSyncIncludesArray(quote.id);
      await hcAiLog({
        tenantId,
        userId,
        toolName: "manage_quote_includes",
        args,
        status: "success",
        resultEntityId: quote.id,
        resultEntityType: "cpq_quote",
        startedAt: t0,
      });
      return { ok: true, data: { quoteId: quote.id, includes: await rowsBase() } };
    }

  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "manage_quote_includes",
      args,
      status: raw.includes("ambig") ? "validation_error" : "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_preview_send_quote_proposal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "preview_send_quote_proposal", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para enviar/proponer cotizaciones." };
  }

  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);
    const full = await prisma.cpqQuote.findFirst({
      where: { id: quote.id, tenantId },
      select: { id: true, code: true, clientName: true, dealId: true, contactId: true, accountId: true },
    });
    if (!full) throw new Error("QUOTE_NOT_FOUND");

    if (!full.dealId) {
      await hcAiLog({
        tenantId,
        userId,
        toolName: "preview_send_quote_proposal",
        args,
        status: "validation_error",
        errorMessage: "no deal",
        startedAt: t0,
      });
      return { ok: false, error: "La cotización debe tener un negocio (deal) vinculado para envío al portal." };
    }

    const lims: string[] = [];
    if (!full.accountId) lims.push("Falta cuenta CRM asociada a la cotización.");
    if (!full.contactId) lims.push("Falta contacto principal en la cotización.");

    let recipientContactId =
      typeof args.recipientContactId === "string" ? args.recipientContactId.trim() : "";
    const effectiveId = recipientContactId || full.contactId;

    let contactRow =
      effectiveId && full.accountId ?
        await prisma.crmContact.findFirst({
          where: { id: effectiveId, tenantId, accountId: full.accountId },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : null;

    recipientContactId = contactRow?.id ?? recipientContactId;
    const emailDraft = typeof args.previewEmailDraft === "string" ? args.previewEmailDraft.trim() : "";
    const attachmentIds = Array.isArray(args.attachmentIds)
      ? (args.attachmentIds as unknown[])
          .map((id) => (typeof id === "string" ? id : null))
          .filter(Boolean) as string[]
      : [];

    const ccContactIds =
      Array.isArray(args.ccContactIds)
        ? (args.ccContactIds as unknown[])
            .map((id) => (typeof id === "string" ? id : null))
            .filter(Boolean) as string[]
        : [];

    if (!contactRow?.email?.trim()) {
      lims.push("El contacto destinatario no tiene correo en CRM.");
    }

    const tokenArgs: Record<string, unknown> = {
      quoteIdOrCode: quote.id,
      recipientContactId: recipientContactId || undefined,
      includeProposalPdf: Boolean(args.includeProposalPdf),
      includeQuotationPdf: Boolean(args.includeQuotationPdf),
      attachmentIds,
      ccContactIds,
      ccEmails: Array.isArray(args.ccEmails) ? args.ccEmails : [],
      bccEmails: Array.isArray(args.bccEmails) ? args.bccEmails : [],
      emailSubject:
        typeof args.emailSubject === "string" && args.emailSubject.trim()
          ? args.emailSubject.trim()
          : undefined,
      followUpTargetStageId:
        typeof args.followUpTargetStageId === "string" && args.followUpTargetStageId.trim()
          ? args.followUpTargetStageId.trim()
          : null,
      followUpInclude: typeof args.followUpInclude === "boolean" ? args.followUpInclude : undefined,
      followUpSkipAll: Boolean(args.followUpSkipAll),
    };

    lims.push("El paso siguiente es send_quote_proposal con los mismos parámetros o previewToken.");

    await hcAiLog({ tenantId, userId, toolName: "preview_send_quote_proposal", args, status: "success", startedAt: t0 });

    return await previewFlow("send_quote_proposal", tenantId, userId, {
      quoteId: quote.id,
      quotationCode: full.code,
      recipientName:
        `${contactRow?.firstName ?? ""} ${contactRow?.lastName ?? ""}`.trim().replace(/\s+/g, " ").trim(),
      recipientEmail: contactRow?.email ?? null,
      limitations: lims,
      emailDraftSnippetPreview: emailDraft ? emailDraft.slice(0, 4000) : null,
      includeProposalPdf: Boolean(args.includeProposalPdf),
      includeQuotationPdf: Boolean(args.includeQuotationPdf),
      reminder:
        "Se enviará correo y posible WhatsApp igual que desde CPQ (PIN portal). Espera OK explícito del usuario antes de send_quote_proposal.",
    }, tokenArgs);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "preview_send_quote_proposal",
      args,
      status: "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}

export async function aiTool_send_quote_proposal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  void pageContext;
  const t0 = Date.now();
  if (!hcCanWriteQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: "send_quote_proposal", args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso." };
  }

  try {
    const tok = typeof args.previewToken === "string" ? args.previewToken.trim() : "";
    let merged = args;
    if (tok) {
      const p = consumePreview(tok, tenantId, userId, "send_quote_proposal");
      if (p) merged = { ...(p.args as Record<string, unknown>), ...args };
    }
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(merged, "quoteIdOrCode"), pageContext);

    const rcId = typeof merged.recipientContactId === "string" ? merged.recipientContactId.trim() : undefined;

    let ccEmails: string[] = [];
    if (Array.isArray(merged.ccEmails)) ccEmails = (merged.ccEmails as unknown[]).filter((x) => typeof x === "string").map(String);
    let bccEmails: string[] = [];
    if (Array.isArray(merged.bccEmails)) bccEmails = (merged.bccEmails as unknown[]).filter((x) => typeof x === "string").map(String);

    const attachmentIds =
      Array.isArray(merged.attachmentIds)
        ? (merged.attachmentIds as unknown[])
            .map((id) => (typeof id === "string" ? id : null))
            .filter(Boolean) as string[]
        : [];

    const ccContactIds =
      Array.isArray(merged.ccContactIds)
        ? (merged.ccContactIds as unknown[])
            .map((id) => (typeof id === "string" ? id : null))
            .filter(Boolean) as string[]
        : [];

    const followUp = hcParseFollowUp(merged);

    const res = await sendQuoteToPortal({
      quoteId: quote.id,
      tenantId,
      userId,
      recipientContactId: rcId,
      ccEmails,
      bccEmails,
      ccContactIds,
      includeProposalPdf: Boolean(merged.includeProposalPdf),
      includeQuotationPdf: Boolean(merged.includeQuotationPdf),
      attachmentIds,
      emailSubject: typeof merged.emailSubject === "string" ? merged.emailSubject : undefined,
      followUp,
    });

    await hcAiLog({
      tenantId,
      userId,
      toolName: "send_quote_proposal",
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });

    return {
      ok: true,
      data: {
        quoteId: quote.id,
        emailId: res.emailId,
        sentTo: res.sentTo,
        portalUrl: res.portalUrl,
        pinGenerated: res.pinGenerated,
        proposalLink: res.proposalLink,
        whatsappPhone: res.whatsappPhone,
        whatsappSnippet: `${res.whatsappPhone ?? ""}`,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: "send_quote_proposal",
      args,
      status: "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: raw };
  }
}
