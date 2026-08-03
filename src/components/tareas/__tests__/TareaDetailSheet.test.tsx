import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TareaDetailSheet } from "../TareaDetailSheet";
import type { TareaItem } from "../types";

vi.mock("@/hooks/useIsMobileViewport", () => ({
  useIsMobileViewport: () => true,
}));

vi.mock("@/hooks/useKeyboardOffset", () => ({
  useKeyboardOffset: () => 0,
}));

vi.mock("@/components/ui/confirm-service", () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../TareaActivityTimeline", () => ({
  TareaActivityTimeline: () => <div data-testid="timeline" />,
}));

const TASK: TareaItem = {
  id: "t1",
  title: "Seguimiento del mail",
  notes: null,
  priority: null,
  status: "open",
  type: "task",
  dueAt: null,
  allDay: true,
  assignedTo: "u1",
  completedBy: null,
  completedAt: null,
  dealId: null,
  accountId: null,
  emailThreadId: null,
  quoteId: null,
  installationId: null,
  emailThreadSubject: null,
  accountName: null,
  dealTitle: null,
  quoteLabel: null,
  installationName: null,
  createdAt: "2026-07-28T12:00:00.000Z",
  createdBy: "u1",
  assigneeIds: ["u1"],
};

const USERS = [{ id: "u1", name: "Carlos Irigoyen" }];
const NAME_BY_ID = new Map([["u1", "Carlos Irigoyen"]]);

describe("TareaDetailSheet", () => {
  it("habilita Guardar al cambiar solo el vencimiento y lo envía en el PATCH", async () => {
    const onSave = vi.fn(async () => true);
    render(
      <TareaDetailSheet
        task={TASK}
        users={USERS}
        nameById={NAME_BY_ID}
        canEdit
        canDelete
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
        onPostpone={vi.fn()}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: "Guardar" });
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Mañana" }));
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, input] = onSave.mock.calls[0]!;
    expect(input.dueAt).toEqual(expect.any(String));
    expect(input.allDay).toBe(true);
    expect(input.title).toBeUndefined();
    expect(input.notes).toBeUndefined();
  });

  it("no marca dirty si el vencimiento no cambia", () => {
    render(
      <TareaDetailSheet
        task={TASK}
        users={USERS}
        nameById={NAME_BY_ID}
        canEdit
        canDelete={false}
        onClose={vi.fn()}
        onSave={vi.fn(async () => true)}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("muestra chips de prioridad y acciones Posponer/Completar", () => {
    render(
      <TareaDetailSheet
        task={TASK}
        users={USERS}
        nameById={NAME_BY_ID}
        canEdit
        canDelete
        onClose={vi.fn()}
        onSave={vi.fn(async () => true)}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
        onPostpone={vi.fn()}
      />,
    );
    expect(screen.getByRole("group", { name: "Prioridad" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Posponer/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Completar$/i })).toBeTruthy();
    expect(screen.getByTestId("timeline")).toBeTruthy();
  });
});
