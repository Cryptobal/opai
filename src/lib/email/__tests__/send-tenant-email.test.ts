import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { sendMock, routingMock, toggleFindUniqueMock, logCreateMock } =
  vi.hoisted(() => ({
    sendMock: vi.fn(),
    routingMock: vi.fn(),
    toggleFindUniqueMock: vi.fn(),
    logCreateMock: vi.fn(),
  }));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: sendMock } },
  buildDeliverabilityHeaders: vi.fn(() => ({
    "List-Unsubscribe": "<mailto:unsubscribe@x>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  })),
  getTenantEmailRouting: routingMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantTransactionalEmailConfig: { findUnique: toggleFindUniqueMock },
    tenantEmailLog: { create: logCreateMock },
  },
}));

import { sendTenantEmail } from "../send-tenant-email";

function defaultRouting(overrides: Partial<{
  from: string;
  replyToGlobal: string;
  bcc: string[];
  replyTo: string;
}> = {}) {
  return {
    from: overrides.from ?? "OPAI <noreply@miempresa.cl>",
    replyToGlobal: overrides.replyToGlobal ?? "comercial@miempresa.cl",
    tenantSlug: "miempresa",
    legacyDteAlwaysBcc: [],
    modules: {
      commercial: {
        bcc: overrides.bcc ?? [],
        replyTo: overrides.replyTo ?? overrides.replyToGlobal ?? "comercial@miempresa.cl",
      },
      operations: { bcc: [], replyTo: "ops@x" },
      finance: { bcc: [], replyTo: "fin@x" },
      system: { bcc: [], replyTo: "sys@x" },
    },
  };
}

describe("sendTenantEmail", () => {
  beforeEach(() => {
    sendMock.mockReset();
    routingMock.mockReset();
    toggleFindUniqueMock.mockReset();
    logCreateMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "msg-1" } });
    toggleFindUniqueMock.mockResolvedValue(null); // default: no toggle row → enabled
    logCreateMock.mockResolvedValue({});
  });

  it("falla con error claro si el tenant no tiene from configurado", async () => {
    routingMock.mockResolvedValue(defaultRouting({ from: "" }));

    await expect(
      sendTenantEmail({
        tenantId: "t-1",
        module: "commercial",
        kind: "cpq_portal_invite",
        to: "cliente@x.cl",
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/no tiene "from" configurado/);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("falla si to está vacío o sin emails válidos", async () => {
    routingMock.mockResolvedValue(defaultRouting());

    await expect(
      sendTenantEmail({
        tenantId: "t-1",
        module: "commercial",
        kind: "k",
        to: [],
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/`to` vacío/);

    await expect(
      sendTenantEmail({
        tenantId: "t-1",
        module: "commercial",
        kind: "k",
        to: "no-es-email",
        subject: "s",
        text: "t",
      }),
    ).rejects.toThrow(/`to` vacío/);
  });

  it("falla si no se pasa html ni text", async () => {
    routingMock.mockResolvedValue(defaultRouting());
    await expect(
      sendTenantEmail({
        tenantId: "t-1",
        module: "commercial",
        kind: "k",
        to: "cliente@x.cl",
        subject: "s",
      }),
    ).rejects.toThrow(/`html` o `text`/);
  });

  it("agrega el BCC automático del módulo", async () => {
    routingMock.mockResolvedValue(
      defaultRouting({ bcc: ["audit@miempresa.cl", "gerencia@miempresa.cl"] }),
    );

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      kind: "cpq_portal_invite",
      to: "cliente@x.cl",
      subject: "s",
      text: "t",
    });

    expect(out.effectiveBcc).toEqual([
      "audit@miempresa.cl",
      "gerencia@miempresa.cl",
    ]);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const callArg = sendMock.mock.calls[0]![0]!;
    expect(callArg.bcc).toEqual([
      "audit@miempresa.cl",
      "gerencia@miempresa.cl",
    ]);
  });

  it("no duplica el BCC cuando caller pasa el mismo email del módulo", async () => {
    routingMock.mockResolvedValue(
      defaultRouting({ bcc: ["audit@miempresa.cl"] }),
    );

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      kind: "k",
      to: "cliente@x.cl",
      subject: "s",
      text: "t",
      bcc: ["AUDIT@miempresa.cl", "extra@miempresa.cl"],
    });

    expect(out.effectiveBcc).toEqual([
      "AUDIT@miempresa.cl",
      "extra@miempresa.cl",
    ]);
  });

  it("excluye del BCC las direcciones que ya están en to o cc", async () => {
    routingMock.mockResolvedValue(
      defaultRouting({
        bcc: ["cliente@x.cl", "copia@x.cl", "audit@miempresa.cl"],
      }),
    );

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      kind: "k",
      to: "Cliente@x.cl",
      cc: ["copia@x.cl"],
      subject: "s",
      text: "t",
    });

    expect(out.effectiveBcc).toEqual(["audit@miempresa.cl"]);
  });

  it("usa el reply-to del módulo si está configurado, sino el global", async () => {
    routingMock.mockResolvedValue(
      defaultRouting({ replyTo: "comercial-override@x.cl", replyToGlobal: "global@x.cl" }),
    );

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      kind: "k",
      to: "cliente@x.cl",
      subject: "s",
      text: "t",
    });

    expect(out.effectiveReplyTo).toBe("comercial-override@x.cl");
  });

  it("respeta replyToOverride sobre el del módulo y el global", async () => {
    routingMock.mockResolvedValue(
      defaultRouting({ replyTo: "comercial@x.cl", replyToGlobal: "global@x.cl" }),
    );

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      kind: "k",
      to: "cliente@x.cl",
      subject: "s",
      text: "t",
      replyToOverride: "ad-hoc@x.cl",
    });

    expect(out.effectiveReplyTo).toBe("ad-hoc@x.cl");
  });

  it("salta el envío cuando el toggle del kind está disabled", async () => {
    routingMock.mockResolvedValue(defaultRouting());
    toggleFindUniqueMock.mockResolvedValue({ enabled: false });

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      // Usar un kind real del catálogo para que la consulta del toggle aplique.
      kind: "cpq_portal_invite",
      to: "cliente@x.cl",
      subject: "s",
      text: "t",
    });

    expect(out.resendId).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    expect(logCreateMock).not.toHaveBeenCalled();
  });

  it("ignora el toggle si el kind está marcado required en el catálogo", async () => {
    routingMock.mockResolvedValue(defaultRouting());
    // El mock responde "disabled", pero como dte_invoice_sent es required, debe igual mandar.
    toggleFindUniqueMock.mockResolvedValue({ enabled: false });

    const out = await sendTenantEmail({
      tenantId: "t-1",
      module: "finance",
      kind: "dte_invoice_sent",
      to: "cliente@x.cl",
      subject: "s",
      text: "t",
    });

    expect(out.resendId).toBe("msg-1");
    expect(sendMock).toHaveBeenCalledTimes(1);
    // El toggle ni siquiera se debe consultar para kinds required.
    expect(toggleFindUniqueMock).not.toHaveBeenCalled();
  });

  it("persiste log con status SENT cuando el envío sale bien", async () => {
    routingMock.mockResolvedValue(defaultRouting());

    await sendTenantEmail({
      tenantId: "t-1",
      module: "commercial",
      kind: "cpq_portal_invite",
      to: "cliente@x.cl",
      subject: "Asunto",
      text: "t",
    });

    expect(logCreateMock).toHaveBeenCalledTimes(1);
    expect(logCreateMock.mock.calls[0]![0]!.data).toMatchObject({
      tenantId: "t-1",
      module: "commercial",
      kind: "cpq_portal_invite",
      subject: "Asunto",
      resendId: "msg-1",
      status: "SENT",
    });
  });

  it("persiste log con status FAILED y relanza cuando Resend explota", async () => {
    routingMock.mockResolvedValue(defaultRouting());
    sendMock.mockRejectedValue(new Error("boom"));

    await expect(
      sendTenantEmail({
        tenantId: "t-1",
        module: "commercial",
        kind: "cpq_portal_invite",
        to: "cliente@x.cl",
        subject: "Asunto",
        text: "t",
      }),
    ).rejects.toThrow("boom");

    expect(logCreateMock).toHaveBeenCalledTimes(1);
    expect(logCreateMock.mock.calls[0]![0]!.data).toMatchObject({
      tenantId: "t-1",
      module: "commercial",
      kind: "cpq_portal_invite",
      status: "FAILED",
      errorMessage: "boom",
    });
  });
});
