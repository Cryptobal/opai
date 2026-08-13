import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLACK_DIGEST_CONFIG,
  SLACK_DIGEST_META,
  parseSlackDigestConfig,
} from "@/lib/integrations/slack/digest-config";

describe("parseSlackDigestConfig", () => {
  it("defaults keep historical Slack digests ON (except comercial diario)", () => {
    expect(parseSlackDigestConfig(null)).toEqual(DEFAULT_SLACK_DIGEST_CONFIG);
    expect(parseSlackDigestConfig("{}")).toEqual(DEFAULT_SLACK_DIGEST_CONFIG);
    expect(DEFAULT_SLACK_DIGEST_CONFIG.comercialWeekly).toBe(true);
    expect(DEFAULT_SLACK_DIGEST_CONFIG.comercialDaily).toBe(false);
    expect(DEFAULT_SLACK_DIGEST_CONFIG.rondas).toBe(true);
  });

  it("honours explicit false toggles", () => {
    const cfg = parseSlackDigestConfig(
      JSON.stringify({
        comercialWeekly: false,
        rondas: false,
        docs: false,
        agenda: false,
        relevo: false,
        sla: false,
        comercialDaily: true,
      }),
    );
    expect(cfg.comercialWeekly).toBe(false);
    expect(cfg.comercialDaily).toBe(true);
    expect(cfg.rondas).toBe(false);
    expect(cfg.docs).toBe(false);
    expect(cfg.agenda).toBe(false);
    expect(cfg.relevo).toBe(false);
    expect(cfg.sla).toBe(false);
  });

  it("ignores invalid JSON and non-boolean fields", () => {
    expect(parseSlackDigestConfig("not-json")).toEqual(DEFAULT_SLACK_DIGEST_CONFIG);
    const cfg = parseSlackDigestConfig(JSON.stringify({ rondas: "no", docs: 1, sla: false }));
    expect(cfg.rondas).toBe(true);
    expect(cfg.docs).toBe(true);
    expect(cfg.sla).toBe(false);
  });
});

describe("SLACK_DIGEST_META", () => {
  it("covers every digest key exactly once", () => {
    const keys = SLACK_DIGEST_META.map((m) => m.key).sort();
    expect(keys).toEqual(
      (Object.keys(DEFAULT_SLACK_DIGEST_CONFIG) as string[]).sort(),
    );
  });
});
