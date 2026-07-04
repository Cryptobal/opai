/**
 * Motor común de vencimientos de documentos (Fase 18).
 *
 * Filosofía: los avisos se emiten SOLO al cruzar hitos de la escalera
 * (T-30, T-14, T-7, T-3, T-1, día 0; post-vencido +1 y luego cada 7 días),
 * nunca como goteo diario. Entre hitos: silencio. El digest agrupado es el
 * canal por defecto; la tarjeta individual se reserva para día 0 / vencidos
 * (todos los tipos) y T-7/T-1 de tipos crítico-legal.
 *
 * Estado por documento (campos aditivos en DocOperacional / OpsDocumentoPersona):
 * - lastExpiryMilestone: último hito notificado → el cron solo actúa si el
 *   documento CRUZÓ un hito nuevo (inmune a reruns).
 * - renewalInProgressUntil: "En trámite" silencia TODA la escalera hasta esa
 *   fecha; si al llegar no se renovó, la escalera reanuda en el hito vigente.
 * - expiryDismissedAt: "Ya no aplica" saca el documento del motor.
 *
 * Consumido por los crons docs-operacionales-alerts, guardia-doc-notifications
 * y docs-expiry-digest.
 */

import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import {
  getGuardiaDocumentosConfig,
  type GuardiaDocumentoConfigItem,
} from "@/lib/guardia-documentos-config";
import { GUARDIA_ALERTING_LIFECYCLE_STATUSES } from "@/lib/personas";

// ==========================================
// Escalera de hitos
// ==========================================

/** Escalera default: días antes del vencimiento en que se avisa (0 = día del vencimiento). */
export const DEFAULT_MILESTONES: readonly number[] = [30, 14, 7, 3, 1, 0];

export const DEFAULT_POST_EXPIRY_CADENCE_DAYS = 7;

/** Política global del tenant (Setting `docs_expiry_policy:{tenantId}`). */
export type ExpiryPolicy = {
  /** Hora local (America/Santiago) a la que se envía el digest diario. */
  digestHour: number;
  /** Máximo de tarjetas individuales por día por tenant; el excedente se pliega al digest. */
  maxCardsPerDay: number;
  /** Si false, no se emite `doc_escalated` al jefe. */
  escalationEnabled: boolean;
  /** Cadencia de recordatorio post-vencido (días entre hitos negativos). */
  postExpiryCadenceDays: number;
};

export const DEFAULT_EXPIRY_POLICY: ExpiryPolicy = {
  digestHour: 7,
  maxCardsPerDay: 5,
  escalationEnabled: true,
  postExpiryCadenceDays: DEFAULT_POST_EXPIRY_CADENCE_DAYS,
};

const POLICY_SETTING_KEY = "docs_expiry_policy";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function parseExpiryPolicy(raw: string | null | undefined): ExpiryPolicy {
  if (!raw?.trim()) return { ...DEFAULT_EXPIRY_POLICY };
  try {
    const parsed = JSON.parse(raw) as Partial<ExpiryPolicy>;
    return {
      digestHour: clampInt(parsed.digestHour, 0, 23, DEFAULT_EXPIRY_POLICY.digestHour),
      maxCardsPerDay: clampInt(parsed.maxCardsPerDay, 0, 50, DEFAULT_EXPIRY_POLICY.maxCardsPerDay),
      escalationEnabled:
        typeof parsed.escalationEnabled === "boolean"
          ? parsed.escalationEnabled
          : DEFAULT_EXPIRY_POLICY.escalationEnabled,
      postExpiryCadenceDays: clampInt(
        parsed.postExpiryCadenceDays,
        1,
        90,
        DEFAULT_EXPIRY_POLICY.postExpiryCadenceDays
      ),
    };
  } catch {
    return { ...DEFAULT_EXPIRY_POLICY };
  }
}

export async function getExpiryPolicy(tenantId: string): Promise<ExpiryPolicy> {
  const setting = await prisma.setting.findFirst({
    where: { key: `${POLICY_SETTING_KEY}:${tenantId}`, tenantId },
    select: { value: true },
  });
  return parseExpiryPolicy(setting?.value ?? null);
}

export async function setExpiryPolicy(
  tenantId: string,
  partial: Partial<ExpiryPolicy>
): Promise<ExpiryPolicy> {
  const current = await getExpiryPolicy(tenantId);
  const next: ExpiryPolicy = {
    digestHour: clampInt(partial.digestHour ?? current.digestHour, 0, 23, current.digestHour),
    maxCardsPerDay: clampInt(
      partial.maxCardsPerDay ?? current.maxCardsPerDay,
      0,
      50,
      current.maxCardsPerDay
    ),
    escalationEnabled:
      typeof partial.escalationEnabled === "boolean"
        ? partial.escalationEnabled
        : current.escalationEnabled,
    postExpiryCadenceDays: clampInt(
      partial.postExpiryCadenceDays ?? current.postExpiryCadenceDays,
      1,
      90,
      current.postExpiryCadenceDays
    ),
  };
  const key = `${POLICY_SETTING_KEY}:${tenantId}`;
  const existing = await prisma.setting.findFirst({ where: { key, tenantId }, select: { id: true } });
  const value = JSON.stringify(next);
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: "docs", tenantId },
    });
  }
  return next;
}

// ==========================================
// Cálculo puro de hitos
// ==========================================

/** Medianoche UTC del día actual — misma convención que calcDocStatus. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Días restantes hasta el vencimiento (negativo si ya venció). */
export function calcDaysRemaining(expiresAt: Date, today: Date): number {
  return Math.ceil((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function sanitizeMilestoneList(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 365);
  if (nums.length === 0) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
}

/**
 * Escalera efectiva para un tipo: la custom (o la default) recortada al
 * `diasAlerta` del tipo — si diasAlerta=15, la escalera parte en T-14.
 * El día 0 siempre está presente.
 */
export function buildLadder(opts: {
  milestones?: number[] | null;
  diasAlerta: number;
}): number[] {
  const base = opts.milestones?.length ? opts.milestones : [...DEFAULT_MILESTONES];
  const diasAlerta = Math.max(0, opts.diasAlerta);
  const trimmed = base.filter((m) => m <= diasAlerta);
  if (!trimmed.includes(0)) trimmed.push(0);
  return [...new Set(trimmed)].sort((a, b) => b - a);
}

/**
 * Hito vigente para un documento según días restantes.
 * - Antes de vencer: el menor hito de la escalera ya cruzado (m >= daysRemaining).
 *   null si aún no cruza el primero (zona de silencio total).
 * - Post-vencido: -1, y luego cada `postExpiryCadenceDays` (-1, -8, -15, … con cadencia 7).
 */
export function currentMilestone(
  daysRemaining: number,
  ladder: number[],
  postExpiryCadenceDays: number = DEFAULT_POST_EXPIRY_CADENCE_DAYS
): number | null {
  if (daysRemaining < 0) {
    const cadence = Math.max(1, postExpiryCadenceDays);
    const overdueDays = -daysRemaining; // >= 1
    return -(1 + cadence * Math.floor((overdueDays - 1) / cadence));
  }
  const crossed = ladder.filter((m) => m >= daysRemaining);
  if (crossed.length === 0) return null;
  return Math.min(...crossed);
}

export type ExpiryEvaluation = {
  /** Hito vigente (null = fuera de ventana, silencio). */
  milestone: number | null;
  /** true si el documento cruzó un hito que aún no fue notificado. */
  crossedNewMilestone: boolean;
  /** true si el documento aparece en el digest (dentro de la ventana de atención). */
  inWindow: boolean;
  /** true si está silenciado por "En trámite" vigente. */
  silenced: boolean;
  /** true si amerita tarjeta individual (antes de aplicar el tope diario). */
  card: boolean;
  /** true si amerita aviso adicional al jefe (`doc_escalated`). */
  escalate: boolean;
};

export function evaluateExpiry(input: {
  daysRemaining: number;
  ladder: number[];
  lastExpiryMilestone: number | null;
  renewalInProgressUntil: Date | null;
  dismissedAt: Date | null;
  criticoLegal: boolean;
  today: Date;
  policy: ExpiryPolicy;
}): ExpiryEvaluation {
  const none: ExpiryEvaluation = {
    milestone: null,
    crossedNewMilestone: false,
    inWindow: false,
    silenced: false,
    card: false,
    escalate: false,
  };
  if (input.dismissedAt) return none;

  const milestone = currentMilestone(
    input.daysRemaining,
    input.ladder,
    input.policy.postExpiryCadenceDays
  );
  if (milestone === null) return none;

  const silenced =
    input.renewalInProgressUntil !== null &&
    input.renewalInProgressUntil.getTime() >= input.today.getTime();

  // Cruce nuevo: nunca notificado, avanzó a un hito más urgente, o el documento
  // fue renovado a una fecha que reinicia el ciclo (hito "menos urgente" que el último).
  const crossedNewMilestone =
    input.lastExpiryMilestone === null || milestone !== input.lastExpiryMilestone;

  const card =
    crossedNewMilestone &&
    !silenced &&
    (milestone <= 0 || (input.criticoLegal && (milestone === 7 || milestone === 1)));

  // Escalamiento: cruzó T-7 sin acción (ni renovado ni en trámite) → los hitos
  // siguientes (T-3, T-1, día 0, post-vencido) notifican además al jefe.
  const escalate =
    crossedNewMilestone && !silenced && input.policy.escalationEnabled && milestone < 7;

  return { milestone, crossedNewMilestone, inWindow: true, silenced, card, escalate };
}

/** Texto humano del estado de vencimiento (compartido por tarjetas, digest y bandeja). */
export function describeDue(daysRemaining: number, expiresAt: Date): string {
  const fecha = format(expiresAt, "dd/MM/yyyy");
  if (daysRemaining < 0) return `venció el ${fecha} (hace ${-daysRemaining} día(s))`;
  if (daysRemaining === 0) return `vence hoy (${fecha})`;
  return `vence en ${daysRemaining} día(s) el ${fecha}`;
}

// ==========================================
// Colectores (normalizan ambos modelos)
// ==========================================

export type ExpiryDocKind = "operacional" | "guardia";

export type ExpiryDocItem = {
  kind: ExpiryDocKind;
  id: string;
  tenantId: string;
  /** Nombre del tipo de documento (ej. "Certificado OS10"). */
  label: string;
  /** Contexto: instalación ("Global" si capa global) o nombre del guardia. */
  contextLabel: string;
  installationId: string | null;
  guardiaId: string | null;
  tipoId: string | null;
  /** Código del tipo para docs de guardia. */
  docTypeCode: string | null;
  expiresAt: Date;
  daysRemaining: number;
  diasAlerta: number;
  criticoLegal: boolean;
  ladder: number[];
  lastExpiryMilestone: number | null;
  renewalInProgressUntil: Date | null;
  renewalMarkedBy: string | null;
  dismissedAt: Date | null;
  /** Status persistido del documento (vigente | por_vencer | vencido | pending | …). */
  status: string;
  /** Deep link en OPAI para "Ver documento". */
  link: string;
  fileUrl: string | null;
};

const MAX_DOCS_PER_TENANT = 500;

export async function collectOperacionalItems(
  tenantId: string,
  today: Date
): Promise<ExpiryDocItem[]> {
  const docs = await prisma.docOperacional.findMany({
    where: {
      tenantId,
      expiresAt: { not: null },
      expiryDismissedAt: null,
      tipo: { tieneVencimiento: true, isActive: true },
    },
    include: {
      tipo: {
        select: { id: true, nombre: true, diasAlerta: true, criticoLegal: true, milestones: true },
      },
      installation: { select: { id: true, name: true } },
    },
    take: MAX_DOCS_PER_TENANT,
  });

  return docs
    .filter((doc) => doc.expiresAt !== null)
    .map((doc) => {
      const expiresAt = new Date(doc.expiresAt as Date);
      const diasAlerta = doc.tipo.diasAlerta ?? 30;
      const ladder = buildLadder({
        milestones: sanitizeMilestoneList(doc.tipo.milestones),
        diasAlerta,
      });
      return {
        kind: "operacional" as const,
        id: doc.id,
        tenantId,
        label: doc.tipo.nombre,
        contextLabel: doc.installation?.name ?? "Global",
        installationId: doc.installationId,
        guardiaId: null,
        tipoId: doc.tipoId,
        docTypeCode: null,
        expiresAt,
        daysRemaining: calcDaysRemaining(expiresAt, today),
        diasAlerta,
        criticoLegal: doc.tipo.criticoLegal,
        ladder,
        lastExpiryMilestone: doc.lastExpiryMilestone,
        renewalInProgressUntil: doc.renewalInProgressUntil,
        renewalMarkedBy: doc.renewalMarkedBy,
        dismissedAt: doc.expiryDismissedAt,
        status: doc.status,
        link: doc.installationId
          ? `/opai/documentos-operativos`
          : `/opai/configuracion/documentos-operacionales`,
        fileUrl: doc.fileUrl,
      };
    });
}

export async function collectGuardiaItems(
  tenantId: string,
  today: Date,
  config?: GuardiaDocumentoConfigItem[]
): Promise<ExpiryDocItem[]> {
  const cfg = config ?? (await getGuardiaDocumentosConfig(tenantId));
  const byType = new Map(cfg.filter((c) => c.hasExpiration).map((c) => [c.code, c]));
  if (byType.size === 0) return [];

  // Nota: NO se filtra status="vencido" (a diferencia del cron previo) porque
  // la cadencia post-vencido necesita seguir recorriendo documentos vencidos.
  const docs = await prisma.opsDocumentoPersona.findMany({
    where: {
      tenantId,
      expiresAt: { not: null },
      expiryDismissedAt: null,
      type: { in: [...byType.keys()] },
      guardia: {
        status: "active",
        lifecycleStatus: { in: [...GUARDIA_ALERTING_LIFECYCLE_STATUSES] },
      },
    },
    include: {
      guardia: {
        include: { persona: { select: { firstName: true, lastName: true } } },
      },
    },
    take: MAX_DOCS_PER_TENANT,
  });

  const items: ExpiryDocItem[] = [];
  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const typeCfg = byType.get(doc.type);
    if (!typeCfg) continue;
    const expiresAt = new Date(doc.expiresAt);
    const diasAlerta = typeCfg.alertDaysBefore;
    const ladder = buildLadder({ milestones: typeCfg.milestones ?? null, diasAlerta });
    const personName =
      `${doc.guardia.persona.firstName} ${doc.guardia.persona.lastName}`.trim();
    items.push({
      kind: "guardia",
      id: doc.id,
      tenantId,
      label: doc.type,
      contextLabel: personName,
      installationId: null,
      guardiaId: doc.guardiaId,
      tipoId: null,
      docTypeCode: doc.type,
      expiresAt,
      daysRemaining: calcDaysRemaining(expiresAt, today),
      diasAlerta,
      criticoLegal: Boolean(typeCfg.criticoLegal),
      ladder,
      lastExpiryMilestone: doc.lastExpiryMilestone,
      renewalInProgressUntil: doc.renewalInProgressUntil,
      renewalMarkedBy: doc.renewalMarkedBy,
      dismissedAt: doc.expiryDismissedAt,
      status: doc.status,
      link: `/personas/guardias/${doc.guardiaId}?tab=operaciones&doc=${doc.id}`,
      fileUrl: doc.fileUrl,
    });
  }
  return items;
}

export async function collectAllExpiryItems(
  tenantId: string,
  today: Date
): Promise<ExpiryDocItem[]> {
  const [operacionales, guardias] = await Promise.all([
    collectOperacionalItems(tenantId, today),
    collectGuardiaItems(tenantId, today),
  ]);
  return [...operacionales, ...guardias];
}

// ==========================================
// Persistencia de hitos y tope diario
// ==========================================

export async function markMilestoneNotified(
  item: Pick<ExpiryDocItem, "kind" | "id">,
  milestone: number | null
): Promise<void> {
  const data = {
    lastExpiryMilestone: milestone,
    lastExpiryMilestoneAt: milestone === null ? null : new Date(),
  };
  if (item.kind === "operacional") {
    await prisma.docOperacional.update({ where: { id: item.id }, data });
  } else {
    await prisma.opsDocumentoPersona.update({ where: { id: item.id }, data });
  }
}

const CARD_BUDGET_KEY = "docs_expiry_cards_state";

export type CardBudgetState = {
  /** dayKey yyyy-MM-dd al que corresponde el conteo. */
  date: string;
  /** Tarjetas individuales enviadas hoy (compartido entre crons operacional/guardia). */
  sent: number;
  /** Tarjetas plegadas al digest por superar el tope. */
  overflow: number;
};

export function dayKeyOf(today: Date): string {
  return format(today, "yyyy-MM-dd");
}

export async function getCardBudgetState(
  tenantId: string,
  dayKey: string
): Promise<CardBudgetState> {
  const setting = await prisma.setting.findFirst({
    where: { key: `${CARD_BUDGET_KEY}:${tenantId}`, tenantId },
    select: { value: true },
  });
  if (setting?.value) {
    try {
      const parsed = JSON.parse(setting.value) as Partial<CardBudgetState>;
      if (parsed.date === dayKey) {
        return {
          date: dayKey,
          sent: clampInt(parsed.sent, 0, 10_000, 0),
          overflow: clampInt(parsed.overflow, 0, 10_000, 0),
        };
      }
    } catch {
      // estado corrupto → reinicia el día
    }
  }
  return { date: dayKey, sent: 0, overflow: 0 };
}

export async function saveCardBudgetState(
  tenantId: string,
  state: CardBudgetState
): Promise<void> {
  const key = `${CARD_BUDGET_KEY}:${tenantId}`;
  const value = JSON.stringify(state);
  const existing = await prisma.setting.findFirst({ where: { key, tenantId }, select: { id: true } });
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: "docs", tenantId },
    });
  }
}

// ==========================================
// Escalamiento
// ==========================================

/**
 * Criterio de jerarquía (documentado en docs/documents/vencimientos.md): no
 * existe FK de "jefe directo" en Admin, así que "el jefe" son los admins
 * activos con rol owner / admin / jefe_operaciones. Los roles con
 * roleTemplateId custom quedan fuera (el broadcast normal ya los cubre si
 * tienen acceso al módulo ops). Si no hay ninguno, notify() cae a broadcast.
 */
const ESCALATION_ROLES = ["owner", "admin", "jefe_operaciones"];

export async function resolveEscalationTargets(tenantId: string): Promise<string[]> {
  const admins = await prisma.admin.findMany({
    where: { tenantId, status: "active", role: { in: ESCALATION_ROLES } },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

// ==========================================
// Runner compartido por los crons de tarjetas
// ==========================================

export type ExpiryCardSender = (
  item: ExpiryDocItem,
  evaluation: ExpiryEvaluation
) => Promise<void>;

export type ExpiryRunResult = {
  cardsSent: number;
  escalations: number;
  milestonesMarked: number;
  overflow: number;
  digestOnly: number;
  errors: number;
};

/**
 * Recorre los items, marca hitos cruzados y despacha tarjetas/escalamientos.
 * - Los cruces que no ameritan tarjeta solo se marcan (viven en el digest).
 * - Las tarjetas respetan el tope diario por tenant; el excedente se marca
 *   igual (se pliega al digest con nota) y se contabiliza en overflow.
 * - Los silenciados ("En trámite") NO se marcan: al expirar el silencio, el
 *   hito vigente se notifica como nuevo.
 */
export async function runExpiryMilestones(opts: {
  tenantId: string;
  items: ExpiryDocItem[];
  policy: ExpiryPolicy;
  today: Date;
  sendCard: ExpiryCardSender;
  sendEscalation?: ExpiryCardSender;
}): Promise<ExpiryRunResult> {
  const { tenantId, items, policy, today } = opts;
  const result: ExpiryRunResult = {
    cardsSent: 0,
    escalations: 0,
    milestonesMarked: 0,
    overflow: 0,
    digestOnly: 0,
    errors: 0,
  };

  const evaluated = items.map((item) => ({
    item,
    evaluation: evaluateExpiry({
      daysRemaining: item.daysRemaining,
      ladder: item.ladder,
      lastExpiryMilestone: item.lastExpiryMilestone,
      renewalInProgressUntil: item.renewalInProgressUntil,
      dismissedAt: item.dismissedAt,
      criticoLegal: item.criticoLegal,
      today,
      policy,
    }),
  }));

  // Documentos que salieron de la ventana (renovados) con hito residual → limpiar ciclo.
  for (const { item, evaluation } of evaluated) {
    if (!evaluation.inWindow && item.lastExpiryMilestone !== null && !item.dismissedAt) {
      try {
        await markMilestoneNotified(item, null);
      } catch (err) {
        result.errors++;
        console.error(`[expiry-engine] Error clearing milestone for ${item.kind}:${item.id}`, err);
      }
    }
  }

  // Cruces digest-only: marcar hito sin enviar tarjeta.
  for (const { item, evaluation } of evaluated) {
    if (!evaluation.crossedNewMilestone || evaluation.silenced || evaluation.card) continue;
    try {
      await markMilestoneNotified(item, evaluation.milestone);
      result.milestonesMarked++;
      result.digestOnly++;
    } catch (err) {
      result.errors++;
      console.error(`[expiry-engine] Error marking milestone for ${item.kind}:${item.id}`, err);
    }
  }

  // Tarjetas: severidad primero (más vencido primero; crítico-legal desempata).
  const cardCandidates = evaluated
    .filter(({ evaluation }) => evaluation.card)
    .sort((a, b) => {
      if (a.item.daysRemaining !== b.item.daysRemaining) {
        return a.item.daysRemaining - b.item.daysRemaining;
      }
      return Number(b.item.criticoLegal) - Number(a.item.criticoLegal);
    });

  const dayKey = dayKeyOf(today);
  const budget = await getCardBudgetState(tenantId, dayKey);

  for (const { item, evaluation } of cardCandidates) {
    const withinBudget = policy.maxCardsPerDay <= 0 || budget.sent < policy.maxCardsPerDay;
    try {
      if (withinBudget) {
        await opts.sendCard(item, evaluation);
        budget.sent++;
        result.cardsSent++;
      } else {
        budget.overflow++;
        result.overflow++;
      }
      await markMilestoneNotified(item, evaluation.milestone);
      result.milestonesMarked++;
    } catch (err) {
      result.errors++;
      console.error(`[expiry-engine] Error sending card for ${item.kind}:${item.id}`, err);
      continue;
    }

    if (evaluation.escalate && opts.sendEscalation) {
      try {
        await opts.sendEscalation(item, evaluation);
        result.escalations++;
      } catch (err) {
        result.errors++;
        console.error(`[expiry-engine] Error escalating ${item.kind}:${item.id}`, err);
      }
    }
  }

  // Escalamientos de cruces sin tarjeta propia (no debería ocurrir con la
  // escalera default — todo hito < 7 amerita tarjeta al ser <= 0 o crítico —
  // pero una escalera custom puede tener T-5/T-2 no-críticos).
  if (opts.sendEscalation) {
    for (const { item, evaluation } of evaluated) {
      if (!evaluation.escalate || evaluation.card || evaluation.silenced) continue;
      if (!evaluation.crossedNewMilestone) continue;
      try {
        await opts.sendEscalation(item, evaluation);
        result.escalations++;
      } catch (err) {
        result.errors++;
        console.error(`[expiry-engine] Error escalating ${item.kind}:${item.id}`, err);
      }
    }
  }

  await saveCardBudgetState(tenantId, budget);
  return result;
}
