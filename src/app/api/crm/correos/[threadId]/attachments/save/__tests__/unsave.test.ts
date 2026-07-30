import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { email: "a@b.c" } }) }));
vi.mock("@/lib/api-auth-productividad", () => ({
  requireCorreosAccess: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({
  resolveApiPerms: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/permissions", () => ({
  canEdit: () => true,
  canEditInstallations: () => true,
}));
vi.mock("@/lib/audit-email", () => ({ auditEmailAction: vi.fn() }));
vi.mock("@/lib/storage", () => ({ deleteFile: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmFile: { findFirst: vi.fn(), delete: vi.fn() },
    crmFileLink: { deleteMany: vi.fn() },
  },
}));

import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { deleteFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { DELETE } from "../route";

describe("DELETE attachments/save (unsave)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCorreosAccess).mockResolvedValue({
      authorized: true,
      ctx: { tenantId: "t1", userId: "u1" },
    } as never);
  });

  it("exige fileId", async () => {
    const req = new NextRequest("http://localhost/api/crm/correos/th1/attachments/save", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(400);
  });

  it("quita CrmFile de procedencia email del hilo", async () => {
    vi.mocked(prisma.crmFile.findFirst).mockResolvedValue({
      id: "f1",
      storageKey: "crm/t1/f1",
      fileName: "Gard.pdf",
    } as never);
    vi.mocked(prisma.crmFileLink.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.crmFile.delete).mockResolvedValue({} as never);

    const req = new NextRequest(
      "http://localhost/api/crm/correos/th1/attachments/save?fileId=f1",
      { method: "DELETE" },
    );
    const res = await DELETE(req, { params: Promise.resolve({ threadId: "th1" }) });
    expect(res.status).toBe(200);
    expect(requireCorreosAccess).toHaveBeenCalledWith("edit");
    expect(prisma.crmFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: "f1",
        tenantId: "t1",
        sourceThreadId: "th1",
        sourceType: "email",
      },
      select: { id: true, storageKey: true, fileName: true },
    });
    expect(deleteFile).toHaveBeenCalledWith("crm/t1/f1");
    expect(prisma.crmFile.delete).toHaveBeenCalledWith({ where: { id: "f1" } });
  });
});
