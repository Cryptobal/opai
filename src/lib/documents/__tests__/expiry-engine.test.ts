/**
 * Matriz QA Fase 18 — motor de vencimientos por hitos (funciones puras).
 *
 * Cubre: silencio fuera de ventana, cruce de hitos, recorte por diasAlerta,
 * tarjeta solo día 0/vencidos (+T-7/T-1 crítico-legal), "En trámite" silencia
 * y reanuda, escalamiento tras T-7, cadencia post-vencido e inmunidad a reruns.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  buildLadder,
  calcDaysRemaining,
  currentMilestone,
  evaluateExpiry,
  parseExpiryPolicy,
  sanitizeMilestoneList,
  DEFAULT_EXPIRY_POLICY,
  DEFAULT_MILESTONES,
} from "../expiry-engine";

const TODAY = new Date(Date.UTC(2026, 6, 4)); // 2026-07-04

function evalDoc(overrides: Partial<Parameters<typeof evaluateExpiry>[0]>) {
  return evaluateExpiry({
    daysRemaining: 0,
    ladder: buildLadder({ diasAlerta: 30 }),
    lastExpiryMilestone: null,
    renewalInProgressUntil: null,
    dismissedAt: null,
    criticoLegal: false,
    today: TODAY,
    policy: { ...DEFAULT_EXPIRY_POLICY },
    ...overrides,
  });
}

describe("buildLadder", () => {
  it("usa la escalera default completa con diasAlerta=30", () => {
    expect(buildLadder({ diasAlerta: 30 })).toEqual([...DEFAULT_MILESTONES]);
  });

  it("recorta la escalera al diasAlerta del tipo (15 → parte en T-14)", () => {
    expect(buildLadder({ diasAlerta: 15 })).toEqual([14, 7, 3, 1, 0]);
  });

  it("siempre incluye el día 0", () => {
    expect(buildLadder({ milestones: [30, 14], diasAlerta: 30 })).toEqual([30, 14, 0]);
  });
});

describe("currentMilestone", () => {
  it("doc a 31 días con escalera de 30: fuera de ventana (silencio)", () => {
    expect(currentMilestone(31, buildLadder({ diasAlerta: 30 }))).toBeNull();
  });

  it("cruza T-30 a los 30..15 días", () => {
    const ladder = buildLadder({ diasAlerta: 30 });
    expect(currentMilestone(30, ladder)).toBe(30);
    expect(currentMilestone(20, ladder)).toBe(30);
    expect(currentMilestone(15, ladder)).toBe(30);
    expect(currentMilestone(14, ladder)).toBe(14);
  });

  it("día 0 es hito 0", () => {
    expect(currentMilestone(0, buildLadder({ diasAlerta: 30 }))).toBe(0);
  });

  it("post-vencido: +1 y luego cada 7 días", () => {
    const ladder = buildLadder({ diasAlerta: 30 });
    expect(currentMilestone(-1, ladder, 7)).toBe(-1);
    expect(currentMilestone(-7, ladder, 7)).toBe(-1);
    expect(currentMilestone(-8, ladder, 7)).toBe(-8);
    expect(currentMilestone(-15, ladder, 7)).toBe(-15);
  });
});

describe("evaluateExpiry — matriz QA", () => {
  it("doc a 31 días: silencio total (ni digest ni tarjeta)", () => {
    const r = evalDoc({ daysRemaining: 31 });
    expect(r.inWindow).toBe(false);
    expect(r.card).toBe(false);
    expect(r.escalate).toBe(false);
  });

  it("cruza T-30: aparece en digest, SIN tarjeta", () => {
    const r = evalDoc({ daysRemaining: 28 });
    expect(r.inWindow).toBe(true);
    expect(r.crossedNewMilestone).toBe(true);
    expect(r.milestone).toBe(30);
    expect(r.card).toBe(false);
  });

  it("entre hitos ya notificados: no re-notifica (rerun del cron no duplica)", () => {
    const r = evalDoc({ daysRemaining: 20, lastExpiryMilestone: 30 });
    expect(r.crossedNewMilestone).toBe(false);
    expect(r.card).toBe(false);
  });

  it("llega a día 0: tarjeta individual para todos los tipos", () => {
    const r = evalDoc({ daysRemaining: 0, lastExpiryMilestone: 1 });
    expect(r.milestone).toBe(0);
    expect(r.card).toBe(true);
  });

  it("vencido: tarjeta y escalamiento en cada hito post-vencido nuevo", () => {
    const r = evalDoc({ daysRemaining: -8, lastExpiryMilestone: -1 });
    expect(r.milestone).toBe(-8);
    expect(r.card).toBe(true);
    expect(r.escalate).toBe(true);
  });

  it("T-7 de tipo normal: solo digest; T-7 crítico-legal: tarjeta", () => {
    const normal = evalDoc({ daysRemaining: 7, lastExpiryMilestone: 14 });
    expect(normal.card).toBe(false);
    const critico = evalDoc({ daysRemaining: 7, lastExpiryMilestone: 14, criticoLegal: true });
    expect(critico.card).toBe(true);
    expect(critico.escalate).toBe(false); // el escalamiento parte DESPUÉS de T-7
  });

  it("T-1 crítico-legal sin acción: tarjeta + escalamiento al jefe", () => {
    const r = evalDoc({ daysRemaining: 1, lastExpiryMilestone: 3, criticoLegal: true });
    expect(r.card).toBe(true);
    expect(r.escalate).toBe(true);
  });

  it("escalamiento deshabilitado por política: no escala", () => {
    const r = evalDoc({
      daysRemaining: 1,
      lastExpiryMilestone: 3,
      policy: { ...DEFAULT_EXPIRY_POLICY, escalationEnabled: false },
    });
    expect(r.escalate).toBe(false);
  });

  it("'En trámite' vigente: silencio total (sin tarjeta ni escalada), sigue en digest", () => {
    const until = new Date(Date.UTC(2026, 6, 15)); // futuro
    const r = evalDoc({ daysRemaining: -2, renewalInProgressUntil: until });
    expect(r.silenced).toBe(true);
    expect(r.card).toBe(false);
    expect(r.escalate).toBe(false);
    expect(r.inWindow).toBe(true); // el digest lo anota "en trámite"
  });

  it("'En trámite' vencido sin renovar: la escalera reanuda en el hito vigente", () => {
    const until = new Date(Date.UTC(2026, 6, 1)); // pasado
    // No se marcó hito durante el silencio → el hito vigente sigue pendiente.
    const r = evalDoc({ daysRemaining: -3, renewalInProgressUntil: until, lastExpiryMilestone: 3 });
    expect(r.silenced).toBe(false);
    expect(r.crossedNewMilestone).toBe(true);
    expect(r.card).toBe(true);
  });

  it("'Ya no aplica': fuera del motor por completo", () => {
    const r = evalDoc({ daysRemaining: -10, dismissedAt: new Date() });
    expect(r.inWindow).toBe(false);
    expect(r.card).toBe(false);
  });

  it("documento renovado (fuera de ventana) con hito residual: se resetea el ciclo", () => {
    const r = evalDoc({ daysRemaining: 60, lastExpiryMilestone: 0 });
    expect(r.inWindow).toBe(false); // el runner limpia lastExpiryMilestone
  });
});

describe("calcDaysRemaining", () => {
  it("negativo cuando ya venció", () => {
    expect(calcDaysRemaining(new Date(Date.UTC(2026, 6, 1)), TODAY)).toBe(-3);
    expect(calcDaysRemaining(new Date(Date.UTC(2026, 6, 4)), TODAY)).toBe(0);
    expect(calcDaysRemaining(new Date(Date.UTC(2026, 6, 11)), TODAY)).toBe(7);
  });
});

describe("parseExpiryPolicy / sanitizeMilestoneList", () => {
  it("defaults ante JSON inválido y clamps ante valores fuera de rango", () => {
    expect(parseExpiryPolicy(null)).toEqual(DEFAULT_EXPIRY_POLICY);
    expect(parseExpiryPolicy("no-json")).toEqual(DEFAULT_EXPIRY_POLICY);
    const p = parseExpiryPolicy(JSON.stringify({ digestHour: 99, maxCardsPerDay: -5 }));
    expect(p.digestHour).toBe(23);
    expect(p.maxCardsPerDay).toBe(0);
  });

  it("sanitiza escaleras custom (dedupe, orden desc, rango)", () => {
    expect(sanitizeMilestoneList([7, 30, 7, 400, -1])).toEqual([30, 7]);
    expect(sanitizeMilestoneList("x")).toBeNull();
  });
});
