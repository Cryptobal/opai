import { describe, it, expect } from "vitest";
import { computeReplyAllRecipients } from "../reply-recipients";

describe("computeReplyAllRecipients", () => {
  it("responde al remitente y copia al resto sin la casilla propia", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "Cliente@Empresa.cl",
      toEmails: ["yo@gard.cl", "socio@empresa.cl"],
      ccEmails: ["asesor@otro.cl"],
      ownEmail: "yo@gard.cl",
    });
    expect(r.to).toEqual(["cliente@empresa.cl"]);
    expect(r.cc).toEqual(["socio@empresa.cl", "asesor@otro.cl"]);
  });

  it("excluye al remitente del cc y deduplica", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "cliente@empresa.cl",
      toEmails: ["yo@gard.cl", "cliente@empresa.cl", "socio@empresa.cl"],
      ccEmails: ["socio@empresa.cl"],
      ownEmail: "yo@gard.cl",
    });
    expect(r.to).toEqual(["cliente@empresa.cl"]);
    expect(r.cc).toEqual(["socio@empresa.cl"]);
  });

  it("sin otros destinatarios el cc queda vacío", () => {
    const r = computeReplyAllRecipients({
      fromEmail: "cliente@empresa.cl",
      toEmails: ["yo@gard.cl"],
      ccEmails: [],
      ownEmail: "yo@gard.cl",
    });
    expect(r.to).toEqual(["cliente@empresa.cl"]);
    expect(r.cc).toEqual([]);
  });
});
