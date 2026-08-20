import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  buildDocStatusTitle,
  DocStatusIcon,
} from "../SendStatusIcons";

const SENT_AT = "2026-08-20T18:05:00.000Z";

describe("buildDocStatusTitle", () => {
  it("marca pendiente cuando es requerida y no se envió", () => {
    expect(
      buildDocStatusTitle({
        variant: "PROFORMA",
        required: true,
        status: "NONE",
        sentAt: null,
        sentCount: 0,
        lastRecipient: null,
      }),
    ).toBe("Proforma: pendiente de enviar");
  });

  it("incluye 1 envío y destinatario cuando SENT", () => {
    const title = buildDocStatusTitle({
      variant: "PROFORMA",
      required: true,
      status: "SENT",
      sentAt: SENT_AT,
      sentCount: 1,
      lastRecipient: "ana@cliente.cl",
    });
    expect(title).toContain("Proforma: enviada");
    expect(title).toContain("(1 envío)");
    expect(title).toContain("a ana@cliente.cl");
  });

  it("incluye N envíos cuando SENT más de una vez", () => {
    const title = buildDocStatusTitle({
      variant: "ESTADO_DE_PAGO",
      required: true,
      status: "SENT",
      sentAt: SENT_AT,
      sentCount: 3,
      lastRecipient: null,
    });
    expect(title).toContain("Estado de pago: enviada");
    expect(title).toContain("(3 envíos)");
  });

  it("no requerida si no hay plan ni envío", () => {
    expect(
      buildDocStatusTitle({
        variant: "PROFORMA",
        required: false,
        status: "NONE",
        sentAt: null,
        sentCount: 0,
        lastRecipient: null,
      }),
    ).toBe("Proforma: no requerida");
  });
});

describe("DocStatusIcon", () => {
  it("muestra el contador visible cuando hay envíos", () => {
    render(
      <DocStatusIcon
        variant="PROFORMA"
        required
        status="SENT"
        sentAt={SENT_AT}
        sentCount={2}
        lastRecipient="ana@cliente.cl"
      />,
    );
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "(2 envíos)",
    );
  });

  it("no muestra número cuando no se envió", () => {
    render(
      <DocStatusIcon
        variant="PROFORMA"
        required
        status="NONE"
        sentAt={null}
        sentCount={0}
        lastRecipient={null}
      />,
    );
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Proforma: pendiente de enviar",
    );
  });
});
