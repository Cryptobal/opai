import { describe, expect, it } from "vitest";
import {
  DEFAULT_RONDAS_NOTIF_POLICY,
  parseRondasNotifPolicy,
} from "@/lib/rondas/notification-policy";
import { RONDA_INSTALLATION_ROUTE_KEYS } from "@/lib/integrations/slack/installation-channel";

describe("parseRondasNotifPolicy", () => {
  it("defaults rondasRouteToInstallationChannel to true (prefer installation channel)", () => {
    expect(parseRondasNotifPolicy(null).rondasRouteToInstallationChannel).toBe(true);
    expect(parseRondasNotifPolicy("{}").rondasRouteToInstallationChannel).toBe(true);
    expect(DEFAULT_RONDAS_NOTIF_POLICY.rondasRouteToInstallationChannel).toBe(true);
  });

  it("honours explicit rondasRouteToInstallationChannel=false", () => {
    const policy = parseRondasNotifPolicy(JSON.stringify({ rondasRouteToInstallationChannel: false }));
    expect(policy.rondasRouteToInstallationChannel).toBe(false);
  });
});

describe("RONDA_INSTALLATION_ROUTE_KEYS", () => {
  it("includes lifecycle ronda events", () => {
    expect(RONDA_INSTALLATION_ROUTE_KEYS.has("ronda_started")).toBe(true);
    expect(RONDA_INSTALLATION_ROUTE_KEYS.has("ronda_completed")).toBe(true);
    expect(RONDA_INSTALLATION_ROUTE_KEYS.has("ronda_overdue_admin")).toBe(true);
  });

  it("excludes digest and generic alerts", () => {
    expect(RONDA_INSTALLATION_ROUTE_KEYS.has("rondas_daily_digest")).toBe(false);
    expect(RONDA_INSTALLATION_ROUTE_KEYS.has("ronda_alert_admin")).toBe(false);
  });
});
