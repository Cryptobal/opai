/**
 * search_emails: la URL del deep-link transporta la búsqueda (`q`) además de
 * `hilo`/`mensaje`, percent-encoded (linkifyLine corta URLs en espacios).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePermissions } from "@/lib/permissions";

const mocks = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  threadFindMany: vi.fn(),
  crmAccountFindMany: vi.fn(),
  hybridSearchThreadIds: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmEmailAccount: { findFirst: mocks.accountFindFirst },
    crmEmailThread: { findMany: mocks.threadFindMany },
    crmAccount: { findMany: mocks.crmAccountFindMany },
  },
}));

vi.mock("@/modules/crm/email/correos-search-hybrid", () => ({
  hybridSearchThreadIds: mocks.hybridSearchThreadIds,
}));

import { toolSearchEmails } from "../help-chat-email-search-tools";

const THREAD_ID = "11111111-2222-4333-8444-555555555555";
const MESSAGE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const THREAD_ROW = {
  id: THREAD_ID,
  subject: "Propuesta Seguridad",
  lastMessageAt: new Date("2026-07-01T12:00:00Z"),
  attachmentCount: 0,
  isUnread: false,
  aiVertical: null,
  accountId: null,
  messages: [{ id: MESSAGE_ID, fromEmail: "cliente@example.cl" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountFindFirst.mockResolvedValue({ id: "acc-1" });
  mocks.hybridSearchThreadIds.mockResolvedValue({
    ids: [THREAD_ID],
    reasonById: new Map([[THREAD_ID, "lexical"]]),
    excerptById: new Map(),
    hasExactMatches: true,
    lexicalCount: 1,
    semanticCount: 0,
    discardedSemantic: 0,
    semanticAvailable: true,
  });
  mocks.threadFindMany.mockResolvedValue([THREAD_ROW]);
  mocks.crmAccountFindMany.mockResolvedValue([]);
});

describe("toolSearchEmails — deep-link url", () => {
  it("results[].url incluye q percent-encoded, hilo y mensaje", async () => {
    const result = (await toolSearchEmails(
      "tenant-a",
      "user-1",
      { query: "Propuesta Seguridad Gard Security" },
      {} as RolePermissions,
    )) as { ok: boolean; results: Array<{ url: string }> };

    expect(result.ok).toBe(true);
    const url = result.results[0]!.url;
    expect(url.startsWith("/crm/correos?")).toBe(true);
    // Percent-encoded (form-encoding de URLSearchParams): sin espacios
    // crudos — linkifyLine corta la URL en el primero.
    expect(url).not.toContain(" ");
    expect(url).toContain("Propuesta+Seguridad");

    const qs = new URLSearchParams(url.split("?")[1]);
    // composeEmailToolQuery agrega `in:all` cuando falta la carpeta.
    expect(qs.get("q")).toBe("Propuesta Seguridad Gard Security in:all");
    expect(qs.get("hilo")).toBe(THREAD_ID);
    expect(qs.get("mensaje")).toBe(MESSAGE_ID);
  });

  it("sin mensajes en el hilo, omite mensaje pero conserva q e hilo", async () => {
    mocks.threadFindMany.mockResolvedValue([{ ...THREAD_ROW, messages: [] }]);
    const result = (await toolSearchEmails(
      "tenant-a",
      "user-1",
      { from: "cliente@example.cl", folder: "inbox" },
      {} as RolePermissions,
    )) as { ok: boolean; results: Array<{ url: string }> };

    expect(result.ok).toBe(true);
    const qs = new URLSearchParams(result.results[0]!.url.split("?")[1]);
    expect(qs.get("q")).toBe("from:cliente@example.cl in:inbox");
    expect(qs.get("hilo")).toBe(THREAD_ID);
    expect(qs.get("mensaje")).toBeNull();
  });
});
