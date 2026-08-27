import { beforeEach, describe, expect, it, vi } from "vitest";

const findDteMock = vi.hoisted(() => vi.fn());
const findConfigMock = vi.hoisted(() => vi.fn());
const updateDteMock = vi.hoisted(() => vi.fn());
const createLogMock = vi.hoisted(() => vi.fn());
const getXmlMock = vi.hoisted(() => vi.fn());
const getPdfMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const getTenantEmailConfigMock = vi.hoisted(() => vi.fn());
const buildFilenameMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findFirst: (...a: unknown[]) => findDteMock(...a),
      update: (...a: unknown[]) => updateDteMock(...a),
    },
    tenantDteConfig: {
      findUnique: (...a: unknown[]) => findConfigMock(...a),
    },
    financeDteEmailLog: {
      create: (...a: unknown[]) => createLogMock(...a),
    },
  },
}));

vi.mock("@/lib/resend", () => ({
  getTenantEmailConfig: (...a: unknown[]) => getTenantEmailConfigMock(...a),
}));

vi.mock("@/lib/email/send-tenant-email", () => ({
  sendTenantEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

vi.mock("../../shared/adapters/dte-provider.adapter", () => ({
  getDteProvider: vi.fn(async () => ({
    getXml: (...a: unknown[]) => getXmlMock(...a),
    getPdf: (...a: unknown[]) => getPdfMock(...a),
  })),
}));

vi.mock("../dte-filename", () => ({
  buildDteAttachmentBaseName: (...a: unknown[]) => buildFilenameMock(...a),
}));

import { resendIssuedDteToSelectedContacts } from "../dte-email.service";

const DTE = {
  id: "dte-1",
  tenantId: "t1",
  direction: "ISSUED",
  siiStatus: "ACCEPTED",
  dteType: 33,
  folio: 1234,
  receiverName: "Cliente SpA",
  receiverRut: "76000000-0",
  receiverEmail: "juan@cliente.cl",
  date: new Date("2026-04-10T12:00:00.000Z"),
  totalAmount: 119000,
  code: "F33-1234",
  crmAccountId: "acc-1",
  installationId: null,
};

describe("resendIssuedDteToSelectedContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findDteMock.mockResolvedValue(DTE);
    findConfigMock.mockResolvedValue({
      emisorRazonSocial: "Gard Security",
      emailTemplateSubject: "{{tipo}} N° {{folio}} - {{razonSocial}}",
      emailTemplateBody: "<p>{{tipo}} {{folio}}</p>",
    });
    getTenantEmailConfigMock.mockResolvedValue({ companyName: "Gard" });
    buildFilenameMock.mockResolvedValue("F1234-Cliente");
    getXmlMock.mockResolvedValue(Buffer.from("<xml/>"));
    getPdfMock.mockResolvedValue(Buffer.from("%PDF"));
    sendEmailMock.mockImplementation(async (input: { to: string | string[] }) => ({
      resendId: "re_1",
      effectiveTo: Array.isArray(input.to) ? input.to : [input.to],
      effectiveCc: [],
      effectiveBcc: [],
    }));
    createLogMock.mockResolvedValue({});
    updateDteMock.mockResolvedValue({});
  });

  it("envía solo XML a la casilla del facturador electrónico", async () => {
    const r = await resendIssuedDteToSelectedContacts(
      "t1",
      "dte-1",
      ["recepciondte@cliente.cl"],
      "user-1",
    );
    expect(r.success).toBe(true);
    expect(r.xmlMailbox?.emails).toEqual(["recepciondte@cliente.cl"]);
    expect(r.others).toBeUndefined();
    expect(getPdfMock).not.toHaveBeenCalled();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0]![0] as {
      to: string[];
      attachments: Array<{ filename: string }>;
    };
    expect(payload.to).toEqual(["recepciondte@cliente.cl"]);
    expect(payload.attachments.map((a) => a.filename)).toEqual([
      "F1234-Cliente.xml",
    ]);
    expect(createLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attachments: "XML_ONLY" }),
      }),
    );
  });

  it("envía XML + PDF a contactos que no son casilla", async () => {
    const r = await resendIssuedDteToSelectedContacts("t1", "dte-1", [
      "juan@cliente.cl",
      "compras@cliente.cl",
    ]);
    expect(r.success).toBe(true);
    expect(r.xmlMailbox).toBeUndefined();
    expect(r.others?.emails).toEqual(["juan@cliente.cl"]);
    expect(getPdfMock).toHaveBeenCalled();
    const payload = sendEmailMock.mock.calls[0]![0] as {
      to: string;
      cc: string[];
      attachments: Array<{ filename: string }>;
    };
    expect(payload.to).toBe("juan@cliente.cl");
    expect(payload.cc).toEqual(["compras@cliente.cl"]);
    expect(payload.attachments.map((a) => a.filename)).toEqual([
      "F1234-Cliente.xml",
      "F1234-Cliente.pdf",
    ]);
  });

  it("parte en dos envíos si hay casilla y otros contactos", async () => {
    await resendIssuedDteToSelectedContacts("t1", "dte-1", [
      "juan@cliente.cl",
      "76090823-1@prd.inbox.febos.cl",
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const first = sendEmailMock.mock.calls[0]![0] as {
      to: string[];
      attachments: unknown[];
    };
    const second = sendEmailMock.mock.calls[1]![0] as {
      to: string;
      attachments: unknown[];
    };
    expect(first.to).toEqual(["76090823-1@prd.inbox.febos.cl"]);
    expect(first.attachments).toHaveLength(1);
    expect(second.to).toBe("juan@cliente.cl");
    expect(second.attachments).toHaveLength(2);
  });

  it("rechaza un borrador", async () => {
    findDteMock.mockResolvedValue({ ...DTE, siiStatus: "DRAFT" });
    const r = await resendIssuedDteToSelectedContacts("t1", "dte-1", [
      "juan@cliente.cl",
    ]);
    expect(r.success).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
