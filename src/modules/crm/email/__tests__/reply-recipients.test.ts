import { describe, it, expect } from "vitest";
import { computeReplyAllRecipients, preferredReplyAddress } from "../reply-recipients";

describe("preferredReplyAddress", () => {
  it("prefiere Reply-To sobre From (listas / via grupo)", () => {
    expect(
      preferredReplyAddress({
        fromEmail: "'Persona' via Grupo <grupo@empresa-ejemplo.cl>",
        replyToEmail: "Persona Real <persona.real@cliente-ejemplo.com>",
      }),
    ).toBe("persona.real@cliente-ejemplo.com");
  });

  it("cae a From si no hay Reply-To", () => {
    expect(
      preferredReplyAddress({
        fromEmail: "Ana Silva <ana@empresa.cl>",
        replyToEmail: null,
      }),
    ).toBe("ana@empresa.cl");
  });
});

describe("computeReplyAllRecipients", () => {
  it("to = replyTo|from; cc = union to+cc menos own y from", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "Ana <ana@x.cl>",
      toEmails: ["yo@empresa-ejemplo.cl", "bob@x.cl"],
      ccEmails: ["cc@x.cl"],
      ownEmail: "yo@empresa-ejemplo.cl",
    });
    expect(r.to).toEqual(["ana@x.cl"]);
    expect(r.cc.sort()).toEqual(["bob@x.cl", "cc@x.cl"]);
  });

  it("usa Reply-To como destinatario principal", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "'Persona' via Grupo <grupo@empresa-ejemplo.cl>",
      replyToEmail: "Persona <persona.real@cliente-ejemplo.com>",
      toEmails: ["grupo@empresa-ejemplo.cl"],
      ccEmails: [],
      ownEmail: "grupo@empresa-ejemplo.cl",
    });
    expect(r.to).toEqual(["persona.real@cliente-ejemplo.com"]);
    expect(r.cc).toEqual([]);
  });

  it("dedup y normaliza mayúsculas", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "a@x.cl",
      toEmails: ["A@x.cl", "b@x.cl"],
      ccEmails: ["B@x.cl"],
      ownEmail: "me@x.cl",
    });
    expect(r.to).toEqual(["a@x.cl"]);
    expect(r.cc).toEqual(["b@x.cl"]);
  });

  it("sin from parseable deja to vacío", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "",
      toEmails: ["a@x.cl"],
      ccEmails: [],
      ownEmail: "me@x.cl",
    });
    expect(r.to).toEqual([]);
  });
});
