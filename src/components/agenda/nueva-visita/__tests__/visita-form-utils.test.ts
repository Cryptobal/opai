import { describe, expect, it } from "vitest";
import {
  canSubmitVisitaForm,
  defaultScheduleParts,
  missingVisitaSubmitHint,
  normalizeEndDate,
  resolveAssignedUserId,
  scheduleFromFormParts,
} from "../visita-form-utils";

describe("resolveAssignedUserId", () => {
  it("usa el asignado cuando hay id", () => {
    expect(resolveAssignedUserId("u2", "me")).toBe("u2");
  });

  it("cae al usuario actual si viene vacío o solo espacios", () => {
    expect(resolveAssignedUserId("", "me")).toBe("me");
    expect(resolveAssignedUserId("   ", "me")).toBe("me");
    expect(resolveAssignedUserId(null, "me")).toBe("me");
    expect(resolveAssignedUserId(undefined, "me")).toBe("me");
  });
});

describe("canSubmitVisitaForm", () => {
  it("exige fecha y hora (o todo el día)", () => {
    expect(canSubmitVisitaForm({ date: "", time: "12:00", allDay: false })).toBe(false);
    expect(canSubmitVisitaForm({ date: "2026-08-07", time: "", allDay: false })).toBe(false);
    expect(canSubmitVisitaForm({ date: "2026-08-07", time: "12:00", allDay: false })).toBe(
      true,
    );
    expect(canSubmitVisitaForm({ date: "2026-08-07", time: "", allDay: true })).toBe(true);
  });

  it("valida rango todo el día", () => {
    expect(
      canSubmitVisitaForm({
        date: "2026-08-07",
        endDate: "2026-08-05",
        time: "",
        allDay: true,
      }),
    ).toBe(false);
    expect(
      canSubmitVisitaForm({
        date: "2026-08-05",
        endDate: "2026-08-07",
        time: "",
        allDay: true,
      }),
    ).toBe(true);
  });

  it("bloquea mientras carga", () => {
    expect(
      canSubmitVisitaForm({
        date: "2026-08-07",
        time: "12:00",
        allDay: false,
        loading: true,
      }),
    ).toBe(false);
  });
});

describe("missingVisitaSubmitHint", () => {
  it("indica fecha u hora faltante", () => {
    expect(missingVisitaSubmitHint({ date: "", time: "", allDay: false })).toBe(
      "Elige una fecha de inicio",
    );
    expect(
      missingVisitaSubmitHint({ date: "2026-08-07", time: "", allDay: false }),
    ).toBe("Elige una hora de inicio");
    expect(
      missingVisitaSubmitHint({
        date: "2026-08-07",
        endDate: "2026-08-05",
        time: "",
        allDay: true,
      }),
    ).toBe("La fecha de término no puede ser anterior al inicio");
    expect(
      missingVisitaSubmitHint({ date: "2026-08-07", time: "12:00", allDay: false }),
    ).toBeNull();
  });
});

describe("normalizeEndDate / scheduleFromFormParts", () => {
  it("normaliza endDate inválido al inicio", () => {
    expect(normalizeEndDate("2026-08-05", "2026-08-03")).toBe("2026-08-05");
    expect(normalizeEndDate("2026-08-05", "2026-08-10")).toBe("2026-08-10");
  });

  it("all-day multi-día produce start/end correctos", () => {
    const s = scheduleFromFormParts({
      date: "2026-08-05",
      endDate: "2026-08-07",
      allDay: true,
    });
    expect(s).not.toBeNull();
    expect(s!.endDate).toBe("2026-08-07");
    expect(s!.endAt.getTime()).toBeGreaterThan(s!.startAt.getTime());
  });
});

describe("defaultScheduleParts", () => {
  it("devuelve fecha Chile YYYY-MM-DD y hora HH:mm", () => {
    const parts = defaultScheduleParts(new Date("2026-08-05T15:10:00.000Z"));
    expect(parts.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parts.endDate).toBe(parts.date);
    expect(parts.time).toMatch(/^\d{2}:\d{2}$/);
  });
});
