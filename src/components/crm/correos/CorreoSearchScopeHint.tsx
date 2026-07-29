"use client";

import { TABS, type CorreoFolderTab } from "./CorreosFilters";
import type { CorreoSearchScope } from "@/modules/crm/email/correos.types";

type Props = {
  scope: CorreoSearchScope | null;
  /** Carpeta de navegación (para el CTA "Solo en …"). */
  navFolder: CorreoFolderTab;
  onScopeToFolder: (folder: CorreoListFolder) => void;
  /** Compacto: chip en la fila móvil. */
  compact?: boolean;
};

type CorreoListFolder = Exclude<CorreoFolderTab, "scheduled">;

function folderLabel(key: CorreoFolderTab): string {
  if (key === "inbox") return "Recibidos";
  return TABS.find((t) => t.key === key)?.label ?? key;
}

/** Indicador de alcance de búsqueda + CTA para acotar a la carpeta actual. */
export function CorreoSearchScopeHint({
  scope,
  navFolder,
  onScopeToFolder,
  compact = false,
}: Props) {
  if (!scope) return null;
  const navKey: CorreoListFolder =
    navFolder === "scheduled" ? "inbox" : navFolder;
  const isGlobal = scope === "all";
  const label = isGlobal
    ? "Buscando en toda la casilla"
    : `Buscando en ${folderLabel(scope as CorreoFolderTab)}`;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => {
          if (isGlobal && navKey !== "all") onScopeToFolder(navKey);
        }}
        disabled={!isGlobal || navKey === "all"}
        className="inline-flex h-9 shrink-0 items-center rounded-full border border-ds-border-default bg-ds-surface-2 px-2.5 text-[12px] text-ds-text-3 ds-tap hover:bg-ds-surface-3 disabled:opacity-70 sm:h-8"
        title={
          isGlobal && navKey !== "all"
            ? `Acotar a ${folderLabel(navKey)}`
            : label
        }
      >
        {isGlobal && navKey !== "all"
          ? `${label} · Solo en ${folderLabel(navKey)}`
          : label}
      </button>
    );
  }

  return (
    <div className="flex h-5 min-w-0 items-center gap-2 text-[12px] text-ds-text-3">
      <span className="truncate">{label}</span>
      {isGlobal && navKey !== "all" && (
        <button
          type="button"
          onClick={() => onScopeToFolder(navKey)}
          className="h-5 shrink-0 text-[12px] font-medium text-primary underline-offset-2 hover:underline ds-tap"
        >
          Solo en {folderLabel(navKey)}
        </button>
      )}
    </div>
  );
}
