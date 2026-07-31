/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CorreoSettingsModal } from "../CorreoSettingsModal";
import {
  DEFAULT_CORREO_SHORTCUTS,
  DEFAULT_CORREO_SWIPE_CONFIG,
} from "../useCorreosViewPreferences";
import { DEFAULT_CORREO_SNOOZE_CONFIG } from "@/modules/crm/email/correo-snooze-presets";

vi.mock("../signature/SignaturePanel", () => ({
  SignaturePanel: () => <div>firma</div>,
}));
vi.mock("../CorreoAiStyleForm", () => ({
  CorreoAiStyleForm: () => <div>ai-style</div>,
}));

const baseProps = {
  onClose: vi.fn(),
  previewLines: 2 as const,
  onPreviewLines: vi.fn(),
  undoSeconds: 5 as const,
  onUndoSeconds: vi.fn(),
  advanceAfterRemove: true,
  onAdvanceAfterRemove: vi.fn(),
  includeSignatureDefault: true,
  onIncludeSignatureDefault: vi.fn(),
  swipeConfig: DEFAULT_CORREO_SWIPE_CONFIG,
  onSwipeConfig: vi.fn(),
  snoozeConfig: DEFAULT_CORREO_SNOOZE_CONFIG,
  onSnoozeConfig: vi.fn(),
  shortcuts: DEFAULT_CORREO_SHORTCUTS,
  onShortcuts: vi.fn(),
};

describe("CorreoSettingsModal portal", () => {
  afterEach(() => cleanup());

  it("monta el dialog en document.body por encima del composer (z-80)", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    render(<CorreoSettingsModal open {...baseProps} initialSection="firma" />, {
      container: host,
    });

    const dialog = screen.getByRole("dialog", { name: /firma/i });
    expect(dialog).toBeTruthy();
    expect(host.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);

    const overlay = document.querySelector("[data-correo-settings-modal]");
    expect(overlay).toBeTruthy();
    expect(overlay?.className).toMatch(/z-\[80\]/);
  });

  it("no renderiza cuando open=false", () => {
    render(<CorreoSettingsModal open={false} {...baseProps} />);
    expect(document.querySelector("[data-correo-settings-modal]")).toBeNull();
  });
});
