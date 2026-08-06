import { describe, expect, it } from "vitest";
import {
  isGenericEmailDomain,
  isUsableCompanyNameForWebDiscovery,
  looksLikeChileanRut,
  websiteFromEmail,
} from "@/lib/company-enrich-guards";

describe("company-enrich-guards", () => {
  it("detecta emails personales", () => {
    expect(isGenericEmailDomain("casasdelavina1507@gmail.com")).toBe(true);
    expect(isGenericEmailDomain("hola@empresa.cl")).toBe(false);
    expect(websiteFromEmail("casasdelavina1507@gmail.com")).toBe("");
    expect(websiteFromEmail("hola@empresa.cl")).toBe("https://empresa.cl");
  });

  it("detecta RUT pegado como nombre de empresa (caso Sernac)", () => {
    expect(looksLikeChileanRut("65192734k")).toBe(true);
    expect(looksLikeChileanRut("65.192.734-K")).toBe(true);
    expect(looksLikeChileanRut("Condominio Huechuraba")).toBe(false);
    expect(isUsableCompanyNameForWebDiscovery("65192734k")).toBe(false);
    expect(isUsableCompanyNameForWebDiscovery("Condominio Huechuraba")).toBe(true);
    expect(isUsableCompanyNameForWebDiscovery("12")).toBe(false);
    expect(isUsableCompanyNameForWebDiscovery("12345678")).toBe(false);
  });
});
