import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CorreoActionChip } from "../CorreoActionChip";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type { RadarCapability } from "@/modules/crm/email/radar-types";

const base: CorreoThreadDTO = {
  id: "t1",
  subject: "Asunto",
  fromEmail: "a@b.cl",
  snippet: null,
  lastMessageAt: null,
  accountId: null,
  accountName: null,
  dealId: null,
  dealTitle: null,
  leadId: null,
  attachmentCount: 0,
  messageCount: 1,
  providerThreadId: null,
  possibleLead: false,
  isUnread: false,
  archivedAt: null,
  trashedAt: null,
  snoozedUntil: null,
  starredAt: null,
  spamAt: null,
  hasDraft: false,
  aiVertical: null,
  vertical: null,
  verticalFixed: false,
};

const caps = (...c: RadarCapability[]) => new Set<RadarCapability>(c);

describe("CorreoActionChip — prioridad determinista", () => {
  it("prioridad 1: Incidente con radar_operaciones", () => {
    render(
      <CorreoActionChip
        thread={{ ...base, vertical: "incidentes", hasDraft: true, possibleLead: true }}
        caps={caps("radar_operaciones", "radar_comercial")}
      />,
    );
    expect(screen.getByText("Incidente")).toBeTruthy();
    expect(screen.queryByText("Borrador")).toBeNull();
    expect(screen.queryByText("Crear lead")).toBeNull();
  });

  it("prioridad 2: Borrador si no es incidente visible", () => {
    render(
      <CorreoActionChip
        thread={{ ...base, hasDraft: true, vertical: "comercial", possibleLead: true }}
        caps={caps("radar_comercial")}
      />,
    );
    expect(screen.getByText("Borrador")).toBeTruthy();
    expect(screen.queryByText("Crear lead")).toBeNull();
  });

  it("prioridad 3: Crear lead con radar_comercial", () => {
    render(
      <CorreoActionChip
        thread={{ ...base, vertical: "comercial", possibleLead: true }}
        caps={caps("radar_comercial")}
      />,
    );
    expect(screen.getByText("Crear lead")).toBeTruthy();
  });

  it("Crear lead no aparece sin radar_comercial", () => {
    render(
      <CorreoActionChip
        thread={{ ...base, vertical: "comercial", possibleLead: true }}
        caps={caps("radar_operaciones")}
      />,
    );
    expect(screen.queryByText("Crear lead")).toBeNull();
  });

  it("sin condiciones → null", () => {
    const { container } = render(
      <CorreoActionChip thread={base} caps={caps("radar_comercial")} />,
    );
    expect(container.textContent).toBe("");
  });

  it("incidente sin capability cae a Borrador", () => {
    render(
      <CorreoActionChip
        thread={{ ...base, vertical: "incidentes", hasDraft: true }}
        caps={caps("radar_comercial")}
      />,
    );
    expect(screen.getByText("Borrador")).toBeTruthy();
    expect(screen.queryByText("Incidente")).toBeNull();
  });
});
