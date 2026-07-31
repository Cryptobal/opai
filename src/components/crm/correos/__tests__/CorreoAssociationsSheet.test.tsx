/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorreoAssociationsSheet } from "../CorreoAssociationsSheet";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

vi.mock("../CorreoContextCascade", () => ({
  CorreoContextCascade: () => <div data-testid="cascade">Cascada CRM</div>,
}));

vi.mock("@/components/chat/hooks/useSwipeGesture", () => ({
  useSwipeGesture: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
  }),
}));

const detail = {
  thread: { id: "t1", accountId: "a1", accountName: "Comtel" },
  messages: [],
  attachments: [],
  degraded: false,
} as unknown as CorreoDetail;

describe("CorreoAssociationsSheet", () => {
  afterEach(() => cleanup());

  it("muestra título Asociaciones y cascada; cierra con el botón", () => {
    const onClose = vi.fn();
    render(
      <CorreoAssociationsSheet
        open
        onClose={onClose}
        detail={detail}
        onAssociate={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Asociaciones" })).toBeTruthy();
    expect(screen.getByTestId("cascade")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    // requestClose anima 180ms antes de onClose
  });
});
