"use client";

import { useRef, useState } from "react";
import { MoreVertical, Plus, Trash2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BundleMember } from "./useBundle";

export type BundleTabId = "consolidated" | `inst:${string}`;

export function BundleTabs({
  members,
  active,
  onChange,
  onAdd,
  onRequestUnlink,
  onRequestDelete,
  canDelete = true,
}: {
  members: BundleMember[];
  active: BundleTabId;
  onChange: (id: BundleTabId) => void;
  onAdd: () => void;
  onRequestUnlink?: (member: BundleMember) => void;
  onRequestDelete?: (member: BundleMember) => void;
  canDelete?: boolean;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain pb-1 [-webkit-mask-image:linear-gradient(90deg,#000_85%,transparent)] [mask-image:linear-gradient(90deg,#000_85%,transparent)]"
      role="tablist"
    >
      <TabButton
        active={active === "consolidated"}
        onClick={() => onChange("consolidated")}
        label="Consolidado"
      />
      {members.map((m) => (
        <InstallationTabButton
          key={m.quoteId}
          member={m}
          active={active === `inst:${m.quoteId}`}
          onClick={() => onChange(`inst:${m.quoteId}`)}
          label={m.quote.installation?.name || m.quote.code}
          onRequestUnlink={onRequestUnlink}
          onRequestDelete={onRequestDelete}
          canDelete={canDelete}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-11 sm:h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] text-primary hover:bg-ds-surface-2"
        aria-label="Agregar instalación"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Instalación</span>
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-11 sm:h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-ds-surface-2 text-ds-text-2 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function InstallationTabButton({
  member,
  active,
  onClick,
  label,
  onRequestUnlink,
  onRequestDelete,
  canDelete,
}: {
  member: BundleMember;
  active: boolean;
  onClick: () => void;
  label: string;
  onRequestUnlink?: (member: BundleMember) => void;
  onRequestDelete?: (member: BundleMember) => void;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  const openMenu = () => {
    clearLongPress();
    setOpen(true);
  };

  const hasActions = Boolean(onRequestUnlink || onRequestDelete);

  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={(event) => {
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            event.preventDefault();
            return;
          }
          onClick();
        }}
        onPointerDown={(event) => {
          if (!hasActions || event.pointerType === "mouse") return;
          longPressFiredRef.current = false;
          longPressOriginRef.current = { x: event.clientX, y: event.clientY };
          longPressTimerRef.current = setTimeout(() => {
            longPressFiredRef.current = true;
            openMenu();
          }, 550);
        }}
        onPointerMove={(event) => {
          const origin = longPressOriginRef.current;
          if (!origin || !longPressTimerRef.current) return;
          const dx = Math.abs(event.clientX - origin.x);
          const dy = Math.abs(event.clientY - origin.y);
          if (dx > 8 || dy > 8) clearLongPress();
        }}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        className={cn(
          "h-11 sm:h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
          hasActions ? "pr-3 sm:pr-9" : "",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-ds-surface-2 text-ds-text-2 hover:text-foreground",
        )}
      >
        {label}
      </button>
      {hasActions ? (
        <button
          type="button"
          className={cn(
            "absolute right-1 hidden h-7 w-7 items-center justify-center rounded-full sm:inline-flex",
            active
              ? "text-primary-foreground/80 hover:bg-primary-foreground/10"
              : "text-ds-text-3 hover:bg-ds-surface-3",
          )}
          aria-label={`Acciones de ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      ) : null}
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[230px] rounded-md border border-ds-border-subtle bg-popover p-1 shadow-md">
            {onRequestUnlink ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-[13px] hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  onRequestUnlink(member);
                }}
              >
                <Unlink className="h-4 w-4" />
                Quitar de la propuesta
              </button>
            ) : null}
            {onRequestDelete ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-[13px] text-status-danger-fg hover:bg-accent"
                disabled={!canDelete}
                onClick={() => {
                  setOpen(false);
                  onRequestDelete(member);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar cotización
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
