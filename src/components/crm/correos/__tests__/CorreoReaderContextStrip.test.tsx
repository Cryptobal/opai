/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorreoReaderContextStrip } from "../CorreoReaderContextStrip";

describe("CorreoReaderContextStrip", () => {
  afterEach(() => cleanup());

  it("muestra cuenta ancla y abre asociaciones; sin acceso a tareas", () => {
    const onOpenAssociations = vi.fn();
    render(
      <CorreoReaderContextStrip
        accountId="acc-1"
        accountName="Comtel Ltda"
        canEdit
        onOpenAssociations={onOpenAssociations}
        onSearchAccount={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Asociaciones: Comtel Ltda/ }));
    expect(onOpenAssociations).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole("button", { name: /tarea/i })).toBeNull();
  });

  it("sin cuenta: CTA Asociar cuenta", () => {
    const onSearchAccount = vi.fn();
    render(
      <CorreoReaderContextStrip
        accountId={null}
        accountName={null}
        canEdit
        onOpenAssociations={() => {}}
        onSearchAccount={onSearchAccount}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Asociar cuenta/ }));
    expect(onSearchAccount).toHaveBeenCalledTimes(1);
  });
});
