import { describe, expect, it } from "vitest";
import { buildBriefPrompt } from "@/lib/integrations/slack/daily-brief";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/permissions";

describe("buildBriefPrompt", () => {
  it("admin incluye titular de caja y cotizaciones", () => {
    const prompt = buildBriefPrompt(DEFAULT_ROLE_PERMISSIONS.admin);
    expect(prompt).toMatch(/titular de caja del mes/);
    expect(prompt).toMatch(/cotizaciones por vencer/);
    expect(prompt).toMatchSnapshot();
  });

  it("supervisor no pide caja ni cotizaciones", () => {
    const prompt = buildBriefPrompt(DEFAULT_ROLE_PERMISSIONS.supervisor);
    expect(prompt).not.toMatch(/titular de caja/);
    expect(prompt).not.toMatch(/cotizaciones por vencer/);
    expect(prompt).toMatch(/tickets abiertos/);
    expect(prompt).toMatchSnapshot();
  });

  it("viewer no pide caja", () => {
    const prompt = buildBriefPrompt(DEFAULT_ROLE_PERMISSIONS.viewer);
    expect(prompt).not.toMatch(/titular de caja/);
    expect(prompt).not.toMatch(/cotizaciones por vencer/);
  });
});
