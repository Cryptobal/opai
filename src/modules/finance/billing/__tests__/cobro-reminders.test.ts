import { describe, it, expect, vi } from "vitest";

// billing-document-send importa transitivamente @/lib/resend, que tira si
// RESEND_API_KEY no está al cargar el módulo. Stub antes del import.
vi.hoisted(() => {
  process.env.RESEND_API_KEY ??= "test_resend_key_for_tests";
});

import {
  isCobroReminderDue,
  evaluateCobroReminder,
  REMINDER_STEPS_BIZ_DAYS,
  type ReminderCandidate,
} from "../cobro-reminders.service";

const FRI = new Date(Date.UTC(2026, 6, 17)); // viernes 2026-07-17
const TUE = new Date(Date.UTC(2026, 6, 21)); // martes  (2 días hábiles después)
const WED = new Date(Date.UTC(2026, 6, 22)); // miércoles (3 días hábiles después)

describe("isCobroReminderDue — escalones en días hábiles", () => {
  it("viernes → martes = 2 hábiles: recordatorio 1 (necesita 3) NO toca", () => {
    expect(isCobroReminderDue(TUE, FRI, 0)).toBe(false);
  });

  it("viernes → miércoles = 3 hábiles (salta el finde): recordatorio 1 toca", () => {
    expect(isCobroReminderDue(WED, FRI, 0)).toBe(true);
  });

  it("escalón 2 necesita 7 hábiles; 3 hábiles no alcanza", () => {
    expect(isCobroReminderDue(WED, FRI, 1)).toBe(false);
  });

  it("tope: no hay recordatorio más allá de los 3 escalones", () => {
    expect(isCobroReminderDue(WED, FRI, REMINDER_STEPS_BIZ_DAYS.length)).toBe(false);
  });
});

function baseCandidate(over: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    folio: 0,
    siiStatus: "DRAFT",
    cobroReminderCount: 0,
    clientActionToken: "tok",
    clientActionTokenExp: new Date(Date.UTC(2026, 9, 1)),
    additionalReferences: null,
    requireProforma: true,
    requireEstadoPago: false,
    proformaStatus: "SENT",
    estadoPagoStatus: "NONE",
    proformaSentAt: FRI,
    estadoPagoSentAt: null,
    ...over,
  };
}

describe("evaluateCobroReminder — cortes", () => {
  it("candidato al día y con escalón cumplido → send PROFORMA index 1", () => {
    const d = evaluateCobroReminder(baseCandidate(), WED);
    expect(d).toEqual({ action: "send", variant: "PROFORMA", index: 1 });
  });

  it("corte por APPROVED", () => {
    const d = evaluateCobroReminder(baseCandidate({ proformaStatus: "APPROVED" }), WED);
    expect(d).toEqual({ action: "skip", reason: "not_pending" });
  });

  it("corte por observación (REJECTED)", () => {
    const d = evaluateCobroReminder(baseCandidate({ proformaStatus: "REJECTED" }), WED);
    expect(d).toEqual({ action: "skip", reason: "not_pending" });
  });

  it("tope de 3 recordatorios", () => {
    const d = evaluateCobroReminder(baseCandidate({ cobroReminderCount: 3 }), WED);
    expect(d).toEqual({ action: "skip", reason: "max_reminders" });
  });

  it("corte por OC ya presente (801)", () => {
    const d = evaluateCobroReminder(
      baseCandidate({ additionalReferences: [{ tipoDocRef: "801", folioRef: "OC-1" }] }),
      WED,
    );
    expect(d).toEqual({ action: "skip", reason: "oc_present" });
  });

  it("corte por documento ya emitido", () => {
    const d = evaluateCobroReminder(baseCandidate({ folio: 55, siiStatus: "ACCEPTED" }), WED);
    expect(d).toEqual({ action: "skip", reason: "already_issued" });
  });

  it("corte por token expirado", () => {
    const d = evaluateCobroReminder(
      baseCandidate({ clientActionTokenExp: new Date(Date.UTC(2026, 6, 1)) }),
      WED,
    );
    expect(d).toEqual({ action: "skip", reason: "token_expired" });
  });

  it("aún no cumple el escalón (2 hábiles < 3) → not_due", () => {
    const d = evaluateCobroReminder(baseCandidate(), TUE);
    expect(d).toEqual({ action: "skip", reason: "not_due" });
  });

  it("usa la variante Estado de Pago si es la pendiente", () => {
    const d = evaluateCobroReminder(
      baseCandidate({
        requireProforma: false,
        proformaStatus: "NONE",
        requireEstadoPago: true,
        estadoPagoStatus: "VIEWED",
        estadoPagoSentAt: FRI,
      }),
      WED,
    );
    expect(d).toEqual({ action: "send", variant: "ESTADO_DE_PAGO", index: 1 });
  });
});
