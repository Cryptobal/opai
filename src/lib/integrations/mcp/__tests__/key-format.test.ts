import { describe, expect, it } from "vitest";
import {
  MCP_KEY_PREFIX,
  MCP_KEY_RANDOM_LEN,
  isValidMcpKeyFormat,
} from "../key-format";

const VALID = `${MCP_KEY_PREFIX}${"A".repeat(MCP_KEY_RANDOM_LEN)}`;

describe("isValidMcpKeyFormat", () => {
  it("acepta opai_mcp_ + 40 chars base62", () => {
    expect(isValidMcpKeyFormat(VALID)).toBe(true);
    expect(
      isValidMcpKeyFormat(`${MCP_KEY_PREFIX}Abcdefghij0123456789KLMNOPqrstuvWxyz0123`),
    ).toBe(true);
  });

  it("rechaza placeholder, vacío y longitudes incorrectas", () => {
    expect(isValidMcpKeyFormat("")).toBe(false);
    expect(isValidMcpKeyFormat("TU_API_KEY")).toBe(false);
    expect(isValidMcpKeyFormat(`${MCP_KEY_PREFIX}${"A".repeat(39)}`)).toBe(false);
    expect(isValidMcpKeyFormat(`${MCP_KEY_PREFIX}${"A".repeat(41)}`)).toBe(false);
  });

  it("rechaza espacios, URL pegada y caracteres fuera de base62", () => {
    expect(isValidMcpKeyFormat(` ${VALID}`)).toBe(false);
    expect(isValidMcpKeyFormat(`${VALID} `)).toBe(false);
    expect(isValidMcpKeyFormat(`https://www.opai.cl/api/mcp/${VALID}`)).toBe(false);
    expect(isValidMcpKeyFormat(`${MCP_KEY_PREFIX}${"A".repeat(39)}-`)).toBe(false);
  });
});
