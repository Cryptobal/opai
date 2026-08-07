"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type { CorreoMenuItem } from "./CorreoContextMenu";

/**
 * Bottom sheet táctil (iPad / móvil) para acciones de fila: archivar, papelera,
 * responder, Copiloto, etc. Reutiliza CorreoMenuItem del menú contextual desktop.
 */
export function CorreoRowActionSheet({
  open,
  title = "Acciones",
  items,
  onClose,
}: {
  open: boolean;
  title?: string;
  items: CorreoMenuItem[];
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open || items.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <Surface
        elevation={4}
        padding="none"
        role="menu"
        aria-label={title}
        className="w-full max-h-[85dvh] overflow-y-auto rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-surface-3" />
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <p className="font-display text-[15px] font-semibold text-ds-text-1">{title}</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="py-1">
          {items.map((item, i) => {
            if (item.header) {
              return (
                <div key={`h-${item.header}-${i}`} className="px-4 pb-1 pt-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-3">
                      {item.header}
                    </span>
                    {item.headerPill && (
                      <span className="rounded-full bg-tint-violet/10 px-1.5 py-0.5 text-[12px] text-tint-violet-fg">
                        {item.headerPill}
                      </span>
                    )}
                  </div>
                </div>
              );
            }
            if (item.sectionLabel) {
              return (
                <div key={`s-${item.sectionLabel}-${i}`}>
                  <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
                  <div className="px-4 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">
                    {item.sectionLabel}
                  </div>
                </div>
              );
            }
            if (item.submenu?.length) {
              return (
                <div key={`sub-${item.label}-${i}`}>
                  {item.divider && i > 0 && (
                    <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
                  )}
                  <p className="px-4 py-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">
                    {item.label}
                  </p>
                  {item.submenu.map((sub, j) => (
                    <button
                      key={`${sub.label}-${j}`}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        sub.onClick();
                        onClose();
                      }}
                      className={`flex min-h-11 w-full items-center gap-3 px-4 pl-8 text-left text-[13px] ds-tap hover:bg-ds-surface-2 ${
                        sub.danger ? "text-status-danger-fg" : "text-ds-text-1"
                      }`}
                    >
                      <span className={`shrink-0 ${sub.danger ? "" : "text-ds-text-3"}`}>
                        {sub.icon}
                      </span>
                      {sub.label}
                    </button>
                  ))}
                </div>
              );
            }
            return (
              <div key={`${item.label}-${i}`}>
                {item.divider && i > 0 && (
                  <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-[13px] ds-tap hover:bg-ds-surface-2 ${
                    item.danger ? "text-status-danger-fg" : "text-ds-text-1"
                  }`}
                >
                  <span className={`shrink-0 ${item.danger ? "" : "text-ds-text-3"}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
