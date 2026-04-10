// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseTicketIdFromEmail } from "../tickets-email";

describe("parseTicketIdFromEmail", () => {
  it("extracts ticketId from plus-addressing", () => {
    const result = parseTicketIdFromEmail({
      toAddresses: ["tickets+a1b2c3d4-e5f6-7890-abcd-ef1234567890@reply.opai.cl"],
      subject: "Re: some subject",
    });
    expect(result.ticketId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(result.method).toBe("plus_addressing");
  });

  it("extracts ticket code from subject [TKT-XXXX]", () => {
    const result = parseTicketIdFromEmail({
      toAddresses: ["support@company.com"],
      subject: "Re: [TKT-ABC123] Some issue",
    });
    expect(result.ticketId).toBe("ABC123");
    expect(result.method).toBe("subject_code");
  });

  it("prefers plus-addressing over subject regex", () => {
    const result = parseTicketIdFromEmail({
      toAddresses: ["tickets+a1b2c3d4-e5f6-7890-abcd-ef1234567890@reply.opai.cl"],
      subject: "[TKT-OTHER] Different ticket",
    });
    expect(result.ticketId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    expect(result.method).toBe("plus_addressing");
  });

  it("returns null for unresolvable emails", () => {
    const result = parseTicketIdFromEmail({
      toAddresses: ["random@email.com"],
      subject: "Hello world",
    });
    expect(result.ticketId).toBeNull();
    expect(result.method).toBe("none");
  });

  it("handles multiple to addresses", () => {
    const result = parseTicketIdFromEmail({
      toAddresses: [
        "random@email.com",
        "tickets+deadbeef-1234-5678-9abc-def012345678@reply.opai.cl",
      ],
      subject: "Re: question",
    });
    expect(result.ticketId).toBe("deadbeef-1234-5678-9abc-def012345678");
    expect(result.method).toBe("plus_addressing");
  });

  it("handles case-insensitive subject code", () => {
    const result = parseTicketIdFromEmail({
      toAddresses: ["support@company.com"],
      subject: "Re: [tkt-abc123] lowercase prefix",
    });
    expect(result.ticketId).toBe("abc123");
    expect(result.method).toBe("subject_code");
  });
});
