import { describe, expect, it } from "vitest";
import {
  explicitDteEmailsForSend,
  filterUnlinkedDteRecipients,
  isDteReceptionEmail,
  isLinkedDteRecipient,
} from "../dte-recipient-guard";

describe("isDteReceptionEmail", () => {
  it("detecta casillas recepciondte y dte@", () => {
    expect(isDteReceptionEmail("recepciondte_polpaico@polpaico.cl")).toBe(true);
    expect(isDteReceptionEmail("RecepcionDTE@ejemplo.cl")).toBe(true);
    expect(isDteReceptionEmail("dte@corrupac.cl")).toBe(true);
    expect(isDteReceptionEmail("xml@cliente.cl")).toBe(true);
    expect(isDteReceptionEmail("kurt.neumann@polpaicosoluciones.cl")).toBe(
      false,
    );
  });

  it("detecta portales Febos / Accepta / Paperless / Suite / eInvoicing", () => {
    expect(isDteReceptionEmail("76090823-1@prd.inbox.febos.cl")).toBe(true);
    expect(isDteReceptionEmail("dte_prod_elecn@smtp.suiteelectronica.com")).toBe(
      true,
    );
    expect(isDteReceptionEmail("dte.cl@einvoicing.signature-cloud.com")).toBe(
      true,
    );
    expect(isDteReceptionEmail("inbox@accepta.com")).toBe(true);
    expect(isDteReceptionEmail("xml@paperless.cl")).toBe(true);
  });
});

describe("isLinkedDteRecipient", () => {
  const contacts = [
    "valesca.ortega@gl-events.com",
    "andres.tagle@glemans.com",
  ];

  it("acepta contacto de la cuenta aunque no sea casilla DTE", () => {
    expect(
      isLinkedDteRecipient("valesca.ortega@gl-events.com", contacts),
    ).toBe(true);
  });

  it("acepta casilla DTE que no está en contactos", () => {
    expect(
      isLinkedDteRecipient("76090823-1@prd.inbox.febos.cl", contacts),
    ).toBe(true);
  });

  it("rechaza un tercero ajeno a la cuenta", () => {
    expect(
      isLinkedDteRecipient("luisalberto.coeymans@glemans.com", contacts),
    ).toBe(false);
  });
});

describe("filterUnlinkedDteRecipients", () => {
  const accountEmails = [
    "valesca.ortega@gl-events.com",
    "andres.tagle@glemans.com",
    "pablo.alvarez@gl-events.com",
  ];

  it("elimina un email que no es contacto de la cuenta", () => {
    const r = filterUnlinkedDteRecipients({
      to: "valesca.ortega@gl-events.com",
      cc: [
        "luisalberto.coeymans@glemans.com",
        "andres.tagle@glemans.com",
      ],
      accountEmails,
    });
    expect(r.to).toBe("valesca.ortega@gl-events.com");
    expect(r.cc).toEqual(["andres.tagle@glemans.com"]);
    expect(r.dropped).toContain("luisalberto.coeymans@glemans.com");
    expect(r.adjusted).toBe(true);
  });

  it("conserva un contacto aunque no esté en accountEmails como recibeFacturacion — basta que esté en la lista", () => {
    const r = filterUnlinkedDteRecipients({
      to: null,
      cc: ["pablo.alvarez@gl-events.com"],
      accountEmails,
    });
    expect(r.to).toBe("pablo.alvarez@gl-events.com");
    expect(r.cc).toEqual([]);
    expect(r.dropped).toEqual([]);
  });

  it("conserva casilla Febos que no es contacto CRM", () => {
    const r = filterUnlinkedDteRecipients({
      to: "tesoreriacims@cimsjri.cl",
      cc: ["76090823-1@prd.inbox.febos.cl"],
      accountEmails: ["tesoreriacims@cimsjri.cl"],
    });
    expect(r.cc).toContain("76090823-1@prd.inbox.febos.cl");
    expect(r.dropped).toEqual([]);
  });

  it("TO vacío + primer CC huérfano + segundo CC contacto → TO = el contacto", () => {
    const r = filterUnlinkedDteRecipients({
      to: null,
      cc: [
        "luisalberto.coeymans@glemans.com",
        "valesca.ortega@gl-events.com",
        "andres.tagle@glemans.com",
      ],
      accountEmails,
    });
    expect(r.to).toBe("valesca.ortega@gl-events.com");
    expect(r.cc).toEqual(["andres.tagle@glemans.com"]);
    expect(r.dropped).toEqual(["luisalberto.coeymans@glemans.com"]);
    expect(r.adjusted).toBe(true);
  });

  it("lista solo huérfanos → to null y cc vacío", () => {
    const r = filterUnlinkedDteRecipients({
      to: "luisalberto.coeymans@glemans.com",
      cc: ["otro.ajeno@example.com"],
      accountEmails,
    });
    expect(r.to).toBeNull();
    expect(r.cc).toEqual([]);
    expect(r.dropped.length).toBe(2);
    expect(r.adjusted).toBe(true);
  });

  it("respeta explicitEmails del override manual", () => {
    const r = filterUnlinkedDteRecipients({
      to: null,
      cc: [
        "luisalberto.coeymans@glemans.com",
        "contador-externo@estudio.cl",
        "valesca.ortega@gl-events.com",
      ],
      accountEmails,
      explicitEmails: ["contador-externo@estudio.cl"],
    });
    expect(r.dropped).toContain("luisalberto.coeymans@glemans.com");
    expect(r.to).toBe("contador-externo@estudio.cl");
    expect(r.cc).toEqual(["valesca.ortega@gl-events.com"]);
  });
});

describe("explicitDteEmailsForSend", () => {
  it("auto-envío no marca nada como explícito", () => {
    expect(
      explicitDteEmailsForSend(
        "AUTO_RECEIVER",
        undefined,
        ["luisalberto.coeymans@glemans.com", "valesca.ortega@gl-events.com"],
        null,
        ["luisalberto.coeymans@glemans.com", "valesca.ortega@gl-events.com"],
      ),
    ).toEqual([]);
  });

  it("reenvío manual no reintroduce el default persistido", () => {
    expect(
      explicitDteEmailsForSend(
        "MANUAL_RESEND",
        undefined,
        ["luisalberto.coeymans@glemans.com", "valesca.ortega@gl-events.com"],
        null,
        ["luisalberto.coeymans@glemans.com", "valesca.ortega@gl-events.com"],
      ),
    ).toEqual([]);
  });

  it("reenvío manual conserva un CC agregado que no estaba en el DTE", () => {
    expect(
      explicitDteEmailsForSend(
        "MANUAL_RESEND",
        undefined,
        ["valesca.ortega@gl-events.com", "contador-externo@estudio.cl"],
        null,
        ["valesca.ortega@gl-events.com"],
      ),
    ).toEqual(["contador-externo@estudio.cl"]);
  });

  it("override de TO a un email nuevo queda explícito", () => {
    expect(
      explicitDteEmailsForSend(
        "MANUAL_OVERRIDE_RECIPIENT",
        "nuevo@cliente.cl",
        ["valesca.ortega@gl-events.com"],
        null,
        ["valesca.ortega@gl-events.com"],
      ),
    ).toEqual(["nuevo@cliente.cl"]);
  });
});
