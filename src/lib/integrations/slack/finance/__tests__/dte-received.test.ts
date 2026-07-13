import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  financeDteFindFirst: vi.fn(),
  crmAccountFindFirst: vi.fn(),
  crmInstallationFindFirst: vi.fn(),
  notify: vi.fn(),
  applyAcuse: vi.fn(),
  getTenantForTeam: vi.fn(),
  getWorkspaceForTenant: vi.fn(),
  resolveLinkedAdmin: vi.fn(),
  slackRespondUrl: vi.fn(),
  slackUpdateMessage: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findFirst: mocks.financeDteFindFirst,
      update: vi.fn(),
    },
    crmAccount: {
      findFirst: mocks.crmAccountFindFirst,
      findMany: vi.fn(),
    },
    crmInstallation: {
      findFirst: mocks.crmInstallationFindFirst,
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notifications/notify", () => ({ notify: mocks.notify }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/modules/finance/billing/dte-received-acuse.service", () => ({
  applyAcuse: mocks.applyAcuse,
}));
vi.mock("../../workspace", () => ({
  getTenantForTeam: mocks.getTenantForTeam,
  getWorkspaceForTenant: mocks.getWorkspaceForTenant,
}));
vi.mock("../../user-link", () => ({
  resolveLinkedAdmin: mocks.resolveLinkedAdmin,
  buildLinkPrompt: vi.fn(() => ({ text: "Vincular", blocks: [] })),
}));
vi.mock("../../api", () => ({
  slackRespondUrl: mocks.slackRespondUrl,
  slackUpdateMessage: mocks.slackUpdateMessage,
}));

import {
  buildReceivedDteSlackCard,
  handleDteAcuseAction,
  notifyReceivedDte,
} from "../dte-received";

function dte(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    dteType: 34,
    folio: 1971603,
    date: new Date("2026-07-09T00:00:00.000Z"),
    issuerName: "SOCIEDAD CONCESIONARIA RUTA 5 S.A.",
    issuerRut: "12345678-5",
    totalAmount: { toNumber: () => 1157 },
    receptionStatus: "PENDING_REVIEW",
    crmAccountId: null,
    installationId: null,
    ...overrides,
  };
}

describe("DTE recibido en Slack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.financeDteFindFirst.mockResolvedValue(dte());
    mocks.crmAccountFindFirst.mockResolvedValue(null);
    mocks.crmInstallationFindFirst.mockResolvedValue(null);
    mocks.notify.mockResolvedValue({ delivered: 1 });
    mocks.applyAcuse.mockResolvedValue({ success: true, message: "Acción RFT notificada al SII correctamente." });
    mocks.getTenantForTeam.mockResolvedValue({ tenantId: "tenant-1", workspaceId: "ws-1" });
    mocks.getWorkspaceForTenant.mockResolvedValue({
      id: "ws-1",
      tenantId: "tenant-1",
      botToken: "xoxb-test",
    });
    mocks.resolveLinkedAdmin.mockResolvedValue({
      adminId: "admin-1",
      perms: { capabilities: { facturacion_create_draft: true } },
    });
    mocks.slackRespondUrl.mockResolvedValue(undefined);
    mocks.slackUpdateMessage.mockResolvedValue({ ts: "123.45" });
  });

  it("renderiza emisor, RUT, fecha, monto y las cuatro decisiones SII", async () => {
    const card = await buildReceivedDteSlackCard("tenant-1", dte().id);

    expect(card?.text).toContain("Factura No Afecta o Exenta");
    expect(card?.text).toContain("$1.157");
    const serialized = JSON.stringify(card?.blocks);
    expect(serialized).toContain("SOCIEDAD CONCESIONARIA RUTA 5 S.A.");
    expect(serialized).toContain("12345678-5");
    expect(serialized).toContain("dteacuse_accept");
    expect(serialized).toContain("dteacuse_claim_content");
    expect(serialized).toContain("dteacuse_claim_partial");
    expect(serialized).toContain("dteacuse_claim_total");
    expect(serialized).toContain("dtecc_open");
  });

  it("retira las decisiones irreversibles cuando el DTE ya fue resuelto", async () => {
    mocks.financeDteFindFirst.mockResolvedValue(dte({ receptionStatus: "CLAIMED" }));

    const card = await buildReceivedDteSlackCard("tenant-1", dte().id);
    const serialized = JSON.stringify(card?.blocks);
    expect(serialized).toContain("Reclamado");
    expect(serialized).not.toContain("dteacuse_accept");
    expect(serialized).toContain("dtecc_open");
  });

  it("publica el evento enrutable dte_received con la tarjeta enriquecida", async () => {
    await notifyReceivedDte("tenant-1", dte().id);

    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        type: "dte_received",
        link: `/finanzas/facturacion/recibidos?openDteId=${dte().id}`,
        data: expect.objectContaining({
          dteId: dte().id,
          __customBlocks: expect.any(Array),
        }),
      }),
    );
  });

  it("ejecuta el reclamo seleccionado en Slack con la identidad del admin vinculado", async () => {
    await handleDteAcuseAction({
      team: { id: "T123" },
      user: { id: "U123" },
      response_url: "https://hooks.slack.test/response",
      container: { channel_id: "C123", message_ts: "123.45" },
      actions: [{ action_id: "dteacuse_claim_total", value: dte().id }],
    });

    expect(mocks.applyAcuse).toHaveBeenCalledWith("tenant-1", "admin-1", {
      dteId: dte().id,
      action: "CLAIM_TOTAL",
      notifySii: true,
      reason: "Acción ejecutada desde Slack por U123",
    });
    expect(mocks.slackUpdateMessage).toHaveBeenCalled();
    expect(mocks.slackRespondUrl).toHaveBeenCalledWith(
      "https://hooks.slack.test/response",
      expect.objectContaining({ text: expect.stringContaining("notificada al SII") }),
    );
  });
});
