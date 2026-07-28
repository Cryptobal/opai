import { describe, expect, it } from "vitest";
import { resolveCreateInclude } from "../email-to-crm-structure-create.service";

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
