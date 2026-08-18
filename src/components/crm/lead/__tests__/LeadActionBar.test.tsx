import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { LeadActionBar } from "../LeadActionBar";

const baseHandlers = {
  onReject: vi.fn(),
  onVerifyAndApprove: vi.fn(),
  onOpenDeal: vi.fn(),
  onReopen: vi.fn(),
};

function assertAnchoredAboveDock(container: HTMLElement) {
  const bar = container.querySelector("[data-lead-action-bar]");
  expect(bar).toBeTruthy();
  expect(bar).toBeInstanceOf(HTMLElement);
  const el = bar as HTMLElement;
  expect(el.className).not.toMatch(/\bbottom-0\b/);
  expect(el.style.bottom).toContain("var(--bottom-nav-height");
}

describe("LeadActionBar", () => {
  it("ancla la variante editable sobre el dock (no bottom-0)", () => {
    const { container } = render(
      <LeadActionBar
        isEditable
        isApproved={false}
        isRejected={false}
        duplicateChecked={false}
        hasConflicts={false}
        approving={false}
        {...baseHandlers}
      />,
    );
    assertAnchoredAboveDock(container);
  });

  it("ancla la variante aprobado (Abrir negocio) sobre el dock", () => {
    const { container } = render(
      <LeadActionBar
        isEditable={false}
        isApproved
        isRejected={false}
        duplicateChecked={false}
        hasConflicts={false}
        approving={false}
        {...baseHandlers}
      />,
    );
    assertAnchoredAboveDock(container);
  });

  it("ancla la variante rechazado (Reabrir) sobre el dock", () => {
    const { container } = render(
      <LeadActionBar
        isEditable={false}
        isApproved={false}
        isRejected
        duplicateChecked={false}
        hasConflicts={false}
        approving={false}
        {...baseHandlers}
      />,
    );
    assertAnchoredAboveDock(container);
  });
});
