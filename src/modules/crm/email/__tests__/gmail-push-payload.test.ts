import { describe, expect, it } from "vitest";
import {
  normalizeGmailHistoryId,
  parseGmailPushBody,
} from "../gmail-push-payload";

function envelope(payload: unknown): unknown {
  return {
    message: {
      data: Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
  };
}

describe("Gmail push payload", () => {
  it("normaliza historyId string y number seguro a decimal string", () => {
    expect(normalizeGmailHistoryId("  123456  ")).toBe("123456");
    expect(normalizeGmailHistoryId(789)).toBe("789");
  });

  it("rechaza historyId inválido o numérico inseguro", () => {
    expect(normalizeGmailHistoryId("12.3")).toBeUndefined();
    expect(normalizeGmailHistoryId(-1)).toBeUndefined();
    expect(
      normalizeGmailHistoryId(Number.MAX_SAFE_INTEGER + 1),
    ).toBeUndefined();
  });

  it("decodifica historyId numérico como string antes de encolar", () => {
    expect(
      parseGmailPushBody(
        envelope({ emailAddress: " casilla@gmail.com ", historyId: 777 }),
      ),
    ).toEqual({
      emailAddress: "casilla@gmail.com",
      historyId: "777",
    });
  });

  it("conserva el push si historyId es inválido", () => {
    expect(
      parseGmailPushBody(
        envelope({ emailAddress: "casilla@gmail.com", historyId: "NaN" }),
      ),
    ).toEqual({ emailAddress: "casilla@gmail.com" });
  });

  it("descarta envelopes sin una casilla válida", () => {
    expect(parseGmailPushBody(envelope({ historyId: "123" }))).toBeNull();
    expect(parseGmailPushBody({ message: { data: "no-base64-json" } })).toBeNull();
  });
});
