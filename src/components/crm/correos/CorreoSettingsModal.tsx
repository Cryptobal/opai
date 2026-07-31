"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Clock, Keyboard, PenLine, Settings, SlidersHorizontal, WandSparkles, X,
} from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { CorreoAiStyleForm } from "./CorreoAiStyleForm";
import { SignaturePanel } from "./signature/SignaturePanel";
import { CorreoSettingsGeneral } from "./CorreoSettingsGeneral";
import { CorreoSwipeSettingsBody } from "./CorreoSwipeSettingsBody";
import { CorreoSnoozeSettingsBody } from "./CorreoSnoozeSettingsBody";
import { CorreoShortcutsBody } from "./CorreoShortcutsBody";
import { useCloseOnBack } from "./useCloseOnBack";
import { useFocusTrap } from "./useFocusTrap";
import type {
  CorreoPreviewLines,
  CorreoShortcuts,
  CorreoSwipeConfig,
  CorreoUndoSeconds,
} from "./useCorreosViewPreferences";
import type { CorreoSnoozeConfig } from "@/modules/crm/email/correo-snooze-presets";

export type CorreoSettingsSection =
  | "general"
  | "firma"
  | "ai"
  | "snooze"
  | "swipe"
  | "shortcuts";

const NAV: {
  id: CorreoSettingsSection;
  label: string;
  icon: typeof Settings;
}[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "firma", label: "Firma", icon: PenLine },
  { id: "ai", label: "Respuesta con IA", icon: WandSparkles },
  { id: "snooze", label: "Posponer", icon: Clock },
  { id: "swipe", label: "Gestos de deslizar", icon: SlidersHorizontal },
  { id: "shortcuts", label: "Atajos de teclado", icon: Keyboard },
];

type Props = {
  open: boolean;
  onClose: () => void;
  initialSection?: CorreoSettingsSection;
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  undoSeconds: CorreoUndoSeconds;
  onUndoSeconds: (seconds: CorreoUndoSeconds) => void;
  advanceAfterRemove: boolean;
  onAdvanceAfterRemove: (next: boolean) => void;
  includeSignatureDefault: boolean;
  onIncludeSignatureDefault: (next: boolean) => void;
  swipeConfig: CorreoSwipeConfig;
  onSwipeConfig: (config: CorreoSwipeConfig) => void;
  snoozeConfig: CorreoSnoozeConfig;
  onSnoozeConfig: (config: CorreoSnoozeConfig) => void;
  shortcuts: CorreoShortcuts;
  onShortcuts: (config: CorreoShortcuts) => void;
};

export function CorreoSettingsModal({
  open, onClose, initialSection = "general",
  previewLines, onPreviewLines,
  undoSeconds, onUndoSeconds,
  advanceAfterRemove, onAdvanceAfterRemove,
  includeSignatureDefault, onIncludeSignatureDefault,
  swipeConfig, onSwipeConfig,
  snoozeConfig, onSnoozeConfig,
  shortcuts, onShortcuts,
}: Props) {
  const [section, setSection] = useState<CorreoSettingsSection>(initialSection);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useCloseOnBack(open, onClose);
  useFocusTrap(panelRef, { active: open, trap: true, onEscape: onClose });

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  if (!open) return null;

  const active = NAV.find((n) => n.id === section) ?? NAV[0]!;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 lg:items-center lg:p-6"
      onClick={onClose}
    >
      <Surface
        ref={panelRef}
        elevation={2}
        padding="none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-correo-scope
        className="flex max-h-[min(620px,calc(100dvh-48px))] w-full max-w-[880px] flex-col overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] lg:flex-row lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ds-surface-3 lg:hidden" />

        <nav
          aria-label="Secciones de configuración"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-ds-border-subtle px-2 py-2 lg:w-[208px] lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-3"
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-[13px] ds-tap lg:w-full ${
                  on
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-ds-text-2 hover:bg-ds-surface-2"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ds-border-subtle px-4 py-3">
            <p id={titleId} className="font-display text-sm font-semibold text-ds-text-1">
              {active.label}
            </p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {section === "general" && (
              <CorreoSettingsGeneral
                previewLines={previewLines}
                onPreviewLines={onPreviewLines}
                undoSeconds={undoSeconds}
                onUndoSeconds={onUndoSeconds}
                advanceAfterRemove={advanceAfterRemove}
                onAdvanceAfterRemove={onAdvanceAfterRemove}
              />
            )}
            {section === "firma" && (
              <div className="space-y-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={includeSignatureDefault}
                    onChange={(e) => onIncludeSignatureDefault(e.target.checked)}
                    className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span className="text-[13px] text-ds-text-2">Usar firma al responder</span>
                </label>
                <SignaturePanel defaultScope="user" />
              </div>
            )}
            {section === "ai" && <CorreoAiStyleForm active={open && section === "ai"} />}
            {section === "snooze" && (
              <CorreoSnoozeSettingsBody config={snoozeConfig} onConfig={onSnoozeConfig} />
            )}
            {section === "swipe" && (
              <CorreoSwipeSettingsBody
                config={swipeConfig}
                onConfig={onSwipeConfig}
                showUndo={false}
              />
            )}
            {section === "shortcuts" && (
              <CorreoShortcutsBody config={shortcuts} onConfig={onShortcuts} />
            )}
          </div>

          <div className="shrink-0 border-t border-ds-border-subtle px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-full rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap lg:ml-auto lg:w-auto lg:px-6"
            >
              Listo
            </button>
          </div>
        </div>
      </Surface>
    </div>
  );
}
