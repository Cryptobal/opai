import { beforeEach, describe, expect, it, vi } from "vitest";

const findAccountMock = vi.hoisted(() => vi.fn());
const findContactsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmAccount: { findFirst: (...a: unknown[]) => findAccountMock(...a) },
    crmContact: { findMany: (...a: unknown[]) => findContactsMock(...a) },
  },
}));

import {
  enrichDteEmailRecipientsFromCrm,
  enrichDteReceiverFromCrm,
  isDteReceptionEmail,
  normalizeAdditionalReferencesForSii,
  normalizeTipoDocRefForSii,
  resolveDteEmailRecipients,
} from "../dte-xml-compliance";

describe("normalizeTipoDocRefForSii", () => {
  it("HES → 802 con razón HES", () => {
    expect(normalizeTipoDocRefForSii("HES")).toEqual({
      tipoDocRef: "802",
      defaultRazonRef: "HES",
    });
  });

  it("hes minúscula → 802", () => {
    expect(normalizeTipoDocRefForSii("hes").tipoDocRef).toBe("802");
  });

  it("GD → 52", () => {
    expect(normalizeTipoDocRefForSii("GD").tipoDocRef).toBe("52");
  });

  it("801 se conserva", () => {
    expect(normalizeTipoDocRefForSii("801")).toEqual({
      tipoDocRef: "801",
      defaultRazonRef: "",
    });
  });
});

describe("normalizeAdditionalReferencesForSii", () => {
  it("convierte HES a 802 y conserva 801", () => {
    const out = normalizeAdditionalReferencesForSii([
      {
        tipoDocRef: "801",
        folioRef: "4420006159",
        fchRef: "2026-08-03",
        razonRef: "",
      },
      {
        tipoDocRef: "HES",
        folioRef: "1001250566",
        fchRef: "2026-08-03",
        razonRef: "",
      },
    ]);
    expect(out).toEqual([
      {
        tipoDocRef: "801",
        folioRef: "4420006159",
        fchRef: "2026-08-03",
        razonRef: "",
      },
      {
        tipoDocRef: "802",
        folioRef: "1001250566",
        fchRef: "2026-08-03",
        razonRef: "HES",
      },
    ]);
  });

  it("omite filas incompletas y deduplica HES+802 mismo folio", () => {
    const out = normalizeAdditionalReferencesForSii([
      { tipoDocRef: "HES", folioRef: "1001", fchRef: "", razonRef: "" },
      {
        tipoDocRef: "HES",
        folioRef: "1001250566",
        fchRef: "2026-08-03",
        razonRef: "",
      },
      {
        tipoDocRef: "802",
        folioRef: "1001250566",
        fchRef: "2026-08-03",
        razonRef: "MIGO",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      tipoDocRef: "802",
      folioRef: "1001250566",
      razonRef: "HES",
    });
  });
});

describe("isDteReceptionEmail", () => {
  it("detecta casillas recepciondte", () => {
    expect(isDteReceptionEmail("recepciondte_polpaico@polpaico.cl")).toBe(true);
    expect(isDteReceptionEmail("RecepcionDTE@ejemplo.cl")).toBe(true);
    expect(isDteReceptionEmail("kurt.neumann@polpaicosoluciones.cl")).toBe(false);
  });

  it("detecta portal Febos", () => {
    expect(isDteReceptionEmail("76090823-1@prd.inbox.febos.cl")).toBe(true);
  });
});

describe("resolveDteEmailRecipients", () => {
  it("promueve casilla DTE a TO y mueve el TO comercial a CC", () => {
    const r = resolveDteEmailRecipients({
      currentTo: "kurt.neumann@polpaicosoluciones.cl",
      currentCc: ["angelica.bruna@polpaicosoluciones.cl"],
      receptionEmails: ["recepciondte_polpaico@polpaico.cl"],
      billingEmails: [],
    });
    expect(r.adjusted).toBe(true);
    expect(r.to).toBe("recepciondte_polpaico@polpaico.cl");
    expect(r.cc).toContain("kurt.neumann@polpaicosoluciones.cl");
    expect(r.cc).toContain("angelica.bruna@polpaicosoluciones.cl");
    expect(r.cc).not.toContain("recepciondte_polpaico@polpaico.cl");
  });

  it("no ajusta si el TO ya es casilla DTE", () => {
    const r = resolveDteEmailRecipients({
      currentTo: "recepciondte_polpaico@polpaico.cl",
      currentCc: ["kurt.neumann@polpaicosoluciones.cl"],
      receptionEmails: ["recepciondte_polpaico@polpaico.cl"],
      billingEmails: [],
    });
    expect(r.adjusted).toBe(false);
    expect(r.to).toBe("recepciondte_polpaico@polpaico.cl");
  });

  it("suma contactos recibeFacturacion al CC", () => {
    const r = resolveDteEmailRecipients({
      currentTo: "recepciondte_polpaico@polpaico.cl",
      currentCc: [],
      receptionEmails: ["recepciondte_polpaico@polpaico.cl"],
      billingEmails: ["finanzas@cliente.cl"],
    });
    expect(r.adjusted).toBe(true);
    expect(r.cc).toContain("finanzas@cliente.cl");
  });

  it("respeta tope de 10 CC", () => {
    const existing = Array.from({ length: 10 }, (_, i) => `c${i}@x.cl`);
    const r = resolveDteEmailRecipients({
      currentTo: "a@x.cl",
      currentCc: existing,
      receptionEmails: ["recepciondte@x.cl"],
      billingEmails: ["extra@x.cl"],
    });
    expect(r.to).toBe("recepciondte@x.cl");
    expect(r.cc.length).toBeLessThanOrEqual(10);
    expect(r.cc).toContain("a@x.cl");
  });
});

describe("enrichDteReceiverFromCrm", () => {
  beforeEach(() => {
    findAccountMock.mockReset();
  });

  it("sin cuenta no toca los campos", async () => {
    const r = await enrichDteReceiverFromCrm({
      tenantId: "t1",
      current: { giro: "X" },
    });
    expect(r).toEqual({ giro: "X", adjusted: false });
    expect(findAccountMock).not.toHaveBeenCalled();
  });

  it("completa giro/dirección/comuna/ciudad vacíos desde el CRM", async () => {
    findAccountMock.mockResolvedValue({
      giro: "CONSTRUCCION DE CARRETERAS",
      industry: "Energía",
      address: "PROVIDENCIA 1760 OF 2002",
      commune: "PROVIDENCIA",
      city: "Santiago",
    });
    const r = await enrichDteReceiverFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-1",
      current: {},
    });
    expect(r.adjusted).toBe(true);
    expect(r.giro).toBe("CONSTRUCCION DE CARRETERAS");
    expect(r.direccion).toBe("PROVIDENCIA 1760 OF 2002");
    expect(r.comuna).toBe("PROVIDENCIA");
    expect(r.ciudad).toBe("Santiago");
  });

  it("si no hay giro formal usa industry", async () => {
    findAccountMock.mockResolvedValue({
      giro: null,
      industry: "Energía",
      address: "Av 1",
      commune: "Santiago",
      city: "Santiago",
    });
    const r = await enrichDteReceiverFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-1",
    });
    expect(r.giro).toBe("Energía");
  });

  it("no pisa valores ya presentes", async () => {
    findAccountMock.mockResolvedValue({
      giro: "OTRO GIRO",
      industry: "X",
      address: "OTRA DIR",
      commune: "OTRA",
      city: "Otra",
    });
    const r = await enrichDteReceiverFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-1",
      current: {
        giro: "GIRO MANUAL",
        direccion: "DIR MANUAL",
        comuna: "COMUNA MANUAL",
        ciudad: "CIUDAD MANUAL",
      },
    });
    expect(r.adjusted).toBe(false);
    expect(r.giro).toBe("GIRO MANUAL");
    expect(findAccountMock).not.toHaveBeenCalled();
  });
});

describe("enrichDteEmailRecipientsFromCrm", () => {
  beforeEach(() => {
    findContactsMock.mockReset();
  });

  const glContacts = [
    {
      email: "valesca.ortega@gl-events.com",
      recibeFacturacion: false,
    },
    {
      email: "andres.tagle@glemans.com",
      recibeFacturacion: false,
    },
    {
      email: "pablo.alvarez@gl-events.com",
      recibeFacturacion: false,
    },
  ];

  it("sin cuenta no toca los destinatarios", async () => {
    const r = await enrichDteEmailRecipientsFromCrm({
      tenantId: "t1",
      currentTo: "a@x.cl",
      currentCc: ["b@x.cl"],
    });
    expect(r.to).toBe("a@x.cl");
    expect(r.cc).toEqual(["b@x.cl"]);
    expect(r.adjusted).toBe(false);
    expect(findContactsMock).not.toHaveBeenCalled();
  });

  it("descarta un CC que no es contacto de la cuenta", async () => {
    findContactsMock.mockResolvedValue(glContacts);
    const r = await enrichDteEmailRecipientsFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-gl",
      currentTo: null,
      currentCc: [
        "luisalberto.coeymans@glemans.com",
        "valesca.ortega@gl-events.com",
        "andres.tagle@glemans.com",
        "pablo.alvarez@gl-events.com",
      ],
    });
    expect(r.to).toBe("valesca.ortega@gl-events.com");
    expect(r.cc).toEqual([
      "andres.tagle@glemans.com",
      "pablo.alvarez@gl-events.com",
    ]);
    expect(r.adjusted).toBe(true);
  });

  it("conserva contacto con recibeFacturacion false", async () => {
    findContactsMock.mockResolvedValue(glContacts);
    const r = await enrichDteEmailRecipientsFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-gl",
      currentTo: "pablo.alvarez@gl-events.com",
      currentCc: ["andres.tagle@glemans.com"],
    });
    expect(r.to).toBe("pablo.alvarez@gl-events.com");
    expect(r.cc).toContain("andres.tagle@glemans.com");
    expect(r.adjusted).toBe(false);
  });

  it("conserva casilla Febos que no es contacto", async () => {
    findContactsMock.mockResolvedValue([
      { email: "tesoreriacims@cimsjri.cl", recibeFacturacion: true },
    ]);
    const r = await enrichDteEmailRecipientsFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-cims",
      currentTo: "tesoreriacims@cimsjri.cl",
      currentCc: ["76090823-1@prd.inbox.febos.cl"],
    });
    expect(r.cc).toContain("76090823-1@prd.inbox.febos.cl");
  });

  it("lista solo huérfanos deja to null", async () => {
    findContactsMock.mockResolvedValue(glContacts);
    const r = await enrichDteEmailRecipientsFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-gl",
      currentTo: "luisalberto.coeymans@glemans.com",
      currentCc: ["otro.ajeno@example.com"],
    });
    expect(r.to).toBeNull();
    expect(r.cc).toEqual([]);
    expect(r.adjusted).toBe(true);
  });

  it("respeta explicitEmails en reenvío manual", async () => {
    findContactsMock.mockResolvedValue(glContacts);
    const r = await enrichDteEmailRecipientsFromCrm({
      tenantId: "t1",
      crmAccountId: "acc-gl",
      currentTo: "valesca.ortega@gl-events.com",
      currentCc: ["contador-externo@estudio.cl"],
      explicitEmails: ["contador-externo@estudio.cl"],
    });
    expect(r.cc).toContain("contador-externo@estudio.cl");
  });
});
