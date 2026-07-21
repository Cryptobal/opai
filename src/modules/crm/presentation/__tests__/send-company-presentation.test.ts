import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  renderEmailMock,
  hashMock,
  contactFindFirstMock,
  contactUpdateMock,
  tenantFindUniqueMock,
  adminFindUniqueMock,
  presentationFindFirstMock,
  presentationCreateMock,
  presentationUpdateMock,
  resendSendMock,
  getTenantEmailConfigMock,
  getTenantCompanyConfigMock,
  getTenantPresentationContentMock,
  buildPresentationPropsMock,
  renderPresentationMock,
} = vi.hoisted(() => ({
  renderEmailMock: vi.fn(),
  hashMock: vi.fn(),
  contactFindFirstMock: vi.fn(),
  contactUpdateMock: vi.fn(),
  tenantFindUniqueMock: vi.fn(),
  adminFindUniqueMock: vi.fn(),
  presentationFindFirstMock: vi.fn(),
  presentationCreateMock: vi.fn(),
  presentationUpdateMock: vi.fn(),
  resendSendMock: vi.fn(),
  getTenantEmailConfigMock: vi.fn(),
  getTenantCompanyConfigMock: vi.fn(),
  getTenantPresentationContentMock: vi.fn(),
  buildPresentationPropsMock: vi.fn(),
  renderPresentationMock: vi.fn(),
}));

vi.mock("@react-email/render", () => ({
  render: renderEmailMock,
}));

vi.mock("bcryptjs", () => ({
  default: { hash: hashMock },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmContact: {
      findFirst: contactFindFirstMock,
      update: contactUpdateMock,
    },
    tenant: { findUnique: tenantFindUniqueMock },
    admin: { findUnique: adminFindUniqueMock },
    crmCompanyPresentation: {
      findFirst: presentationFindFirstMock,
      create: presentationCreateMock,
      update: presentationUpdateMock,
    },
  },
}));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: resendSendMock } },
  getTenantEmailConfig: getTenantEmailConfigMock,
}));

vi.mock("@/emails/CompanyPresentationEmail", () => ({
  CompanyPresentationEmail: vi.fn(() => ({ type: "company-presentation-email" })),
}));

vi.mock("@/lib/notifications/notify", () => ({
  notify: vi.fn().mockResolvedValue({ delivered: 0 }),
}));

vi.mock("@/lib/emails/site-url", () => ({
  buildEmailUrl: vi.fn(
    (path: string) => `https://gard.cl${path}`,
  ),
}));

vi.mock("@/lib/tenant-config", () => ({
  getTenantCompanyConfig: getTenantCompanyConfigMock,
}));

vi.mock("@/lib/tenant-presentation", () => ({
  getTenantPresentationContent: getTenantPresentationContentMock,
}));

vi.mock("@/lib/email-address", () => ({
  normalizeEmailAddress: vi.fn((email: string) => email.trim().toLowerCase()),
  normalizeEmailList: vi.fn((emails?: string[]) =>
    (emails ?? []).map((email) => email.trim().toLowerCase()),
  ),
}));

vi.mock("@/lib/text-format", () => ({
  formatChileanPhone: vi.fn(() => null),
}));

vi.mock("@/lib/pdf/templates/proposal/build-presentation-props", () => ({
  buildInstitutionalPresentationProps: buildPresentationPropsMock,
}));

vi.mock("@/lib/pdf/templates/proposal/render-proposal", () => ({
  renderProposalToBufferFromProps: renderPresentationMock,
}));

import {
  SendPresentationError,
  sendCompanyPresentation,
} from "../send-company-presentation";

const contact = {
  id: "contact-1",
  accountId: "account-1",
  firstName: "Ana",
  lastName: "Pérez",
  roleTitle: "Gerenta de Operaciones",
  email: "ana@acme.cl",
  phone: null,
  portalEnabled: true,
  portalPinVisible: "4821",
  account: {
    name: "ACME Chile",
    industry: "Logística",
    segment: "Enterprise",
  },
};

describe("sendCompanyPresentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    contactFindFirstMock.mockResolvedValue(contact);
    contactUpdateMock.mockResolvedValue({});
    tenantFindUniqueMock.mockResolvedValue({ slug: "gard" });
    adminFindUniqueMock.mockResolvedValue({ name: "Ejecutiva Gard" });
    presentationFindFirstMock.mockResolvedValue(null);
    presentationCreateMock.mockResolvedValue({});
    presentationUpdateMock.mockResolvedValue({});
    getTenantEmailConfigMock.mockResolvedValue({
      from: "Gard <comercial@gard.cl>",
      replyTo: "comercial@gard.cl",
    });
    getTenantCompanyConfigMock.mockResolvedValue({
      commercialName: "Gard Security",
      logoUrl: "https://gard.cl/logo.png",
      brandingLogoWhite: null,
    });
    getTenantPresentationContentMock.mockResolvedValue({ sections: [] });
    buildPresentationPropsMock.mockResolvedValue({
      fileName: "Presentacion-ACME-Chile.pdf",
      variant: "institutional",
      companyName: "ACME Chile",
    });
    renderPresentationMock.mockResolvedValue(
      Buffer.from("%PDF-presentacion-comercial"),
    );
    renderEmailMock
      .mockResolvedValueOnce("<html>presentación</html>")
      .mockResolvedValueOnce("presentación en texto");
    resendSendMock.mockResolvedValue({ data: { id: "email-123" }, error: null });
  });

  it("mantiene el enlace al portal y adjunta el PDF personalizado", async () => {
    const result = await sendCompanyPresentation({
      tenantId: "tenant-1",
      userId: "admin-1",
      contactId: "contact-1",
      cc: ["COPIA@ACME.CL"],
    });

    expect(buildPresentationPropsMock).toHaveBeenCalledWith("tenant-1", {
      companyName: "ACME Chile",
      contactName: "Ana Pérez",
      contactPosition: "Gerenta de Operaciones",
      industry: "Logística",
      segment: "Enterprise",
    });
    expect(renderPresentationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "institutional",
        companyName: "ACME Chile",
        portalUrl:
          "https://gard.cl/portal/cliente?section=presentacion&email=ana%40acme.cl",
      }),
    );

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const payload = resendSendMock.mock.calls[0]![0]!;
    expect(payload).toMatchObject({
      to: "ana@acme.cl",
      cc: ["copia@acme.cl"],
      html: "<html>presentación</html>",
      text: "presentación en texto",
    });
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0]).toMatchObject({
      filename: "Presentacion-ACME-Chile.pdf",
      contentType: "application/pdf",
    });
    expect(Buffer.isBuffer(payload.attachments[0].content)).toBe(true);
    expect(payload.attachments[0].content.toString()).toContain("%PDF");
    expect(result).toMatchObject({
      emailId: "email-123",
      emailSent: true,
      sentTo: "ana@acme.cl",
    });
  });

  it("no envía un correo incompleto si falla la generación del PDF", async () => {
    buildPresentationPropsMock.mockRejectedValueOnce(
      new Error("renderer unavailable"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const promise = sendCompanyPresentation({
      tenantId: "tenant-1",
      userId: "admin-1",
      contactId: "contact-1",
    });

    await expect(promise).rejects.toMatchObject({
      code: "email_failed",
      name: SendPresentationError.name,
    });
    expect(resendSendMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
