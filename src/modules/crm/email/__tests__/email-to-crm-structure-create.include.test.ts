import { describe, expect, it } from "vitest";
import {
  resolveCreateInclude,
  resolveStructurePrimaryContactId,
} from "../email-to-crm-structure-create.service";

describe("resolveCreateInclude", () => {
  it("include undefined → defaults históricos (todo true salvo followUpTask/quote/milestones)", () => {
    expect(resolveCreateInclude(undefined)).toEqual({
      contact: true,
      deal: true,
      installations: true,
      attachments: true,
      followUpTask: false,
      quote: false,
      milestones: false,
    });
  });

  it("todos false excepto cuenta (siempre creada fuera de include)", () => {
    expect(
      resolveCreateInclude({
        contact: false,
        deal: false,
        installations: false,
        attachments: false,
        followUpTask: false,
        quote: false,
        milestones: false,
      }),
    ).toEqual({
      contact: false,
      deal: false,
      installations: false,
      attachments: false,
      followUpTask: false,
      quote: false,
      milestones: false,
    });
  });

  it("followUpTask solo true si se pide explícito", () => {
    expect(resolveCreateInclude({ followUpTask: true }).followUpTask).toBe(true);
    expect(resolveCreateInclude({}).followUpTask).toBe(false);
  });

  it("quote y milestones solo true si se piden explícito", () => {
    expect(resolveCreateInclude({ quote: true }).quote).toBe(true);
    expect(resolveCreateInclude({ milestones: true }).milestones).toBe(true);
    expect(resolveCreateInclude({}).quote).toBe(false);
    expect(resolveCreateInclude({}).milestones).toBe(false);
  });

  it("campos omitidos conservan default true (salvo opt-in)", () => {
    expect(resolveCreateInclude({ deal: false })).toEqual({
      contact: true,
      deal: false,
      installations: true,
      attachments: true,
      followUpTask: false,
      quote: false,
      milestones: false,
    });
  });
});

describe("resolveStructurePrimaryContactId", () => {
  it("prioriza el contacto del plan sobre el del hilo (evita FK huérfano)", () => {
    expect(
      resolveStructurePrimaryContactId({
        forceCreateNew: false,
        validatedThreadContactId: "thread-contact",
        firstPlanContactId: "plan-contact",
      }),
    ).toBe("plan-contact");
  });

  it("si el hilo tenía contactId huérfano (null validado) usa el del plan", () => {
    expect(
      resolveStructurePrimaryContactId({
        forceCreateNew: false,
        validatedThreadContactId: null,
        firstPlanContactId: "plan-contact",
      }),
    ).toBe("plan-contact");
  });

  it("sin contacto del plan, usa el del hilo solo si está validado", () => {
    expect(
      resolveStructurePrimaryContactId({
        forceCreateNew: false,
        validatedThreadContactId: "thread-contact",
        firstPlanContactId: undefined,
      }),
    ).toBe("thread-contact");
    expect(
      resolveStructurePrimaryContactId({
        forceCreateNew: false,
        validatedThreadContactId: null,
        firstPlanContactId: undefined,
      }),
    ).toBeUndefined();
  });

  it("create_new no reutiliza el contacto del hilo", () => {
    expect(
      resolveStructurePrimaryContactId({
        forceCreateNew: true,
        validatedThreadContactId: "thread-contact",
        firstPlanContactId: undefined,
      }),
    ).toBeUndefined();
    expect(
      resolveStructurePrimaryContactId({
        forceCreateNew: true,
        validatedThreadContactId: "thread-contact",
        firstPlanContactId: "plan-contact",
      }),
    ).toBe("plan-contact");
  });
});
