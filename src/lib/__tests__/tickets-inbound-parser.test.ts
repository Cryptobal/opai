// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseTicketIdFromEmail } from "../tickets-email";

describe("Inbound Email Parser", () => {
  describe("Plus-addressing resolution", () => {
    it("parses UUID from tickets+ prefix", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: ["tickets+550e8400-e29b-41d4-a716-446655440000@reply.opai.cl"],
        subject: "Some subject",
      });
      expect(result.ticketId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.method).toBe("plus_addressing");
    });

    it("ignores non-UUID plus addresses", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: ["tickets+not-a-uuid@reply.opai.cl"],
        subject: "Some subject",
      });
      expect(result.ticketId).toBeNull();
      expect(result.method).not.toBe("plus_addressing");
    });
  });

  describe("Subject regex fallback", () => {
    it("matches [TKT-CODE] format", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: ["generic@company.com"],
        subject: "[TKT-TK202604001] Issue description",
      });
      expect(result.ticketId).toBe("TK202604001");
      expect(result.method).toBe("subject_code");
    });

    it("matches code at various positions in subject", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: ["generic@company.com"],
        subject: "Re: Fwd: [TKT-ABC1] Something",
      });
      expect(result.ticketId).toBe("ABC1");
    });

    it("does not match without brackets", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: ["generic@company.com"],
        subject: "TKT-ABC1 Something",
      });
      expect(result.ticketId).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("handles empty arrays", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: [],
        subject: "",
      });
      expect(result.ticketId).toBeNull();
    });

    it("handles undefined optional fields", () => {
      const result = parseTicketIdFromEmail({
        toAddresses: ["test@test.com"],
        subject: "test",
        inReplyTo: undefined,
        references: undefined,
      });
      expect(result.ticketId).toBeNull();
    });
  });
});
