"use client";

import {
  Code2,
  FileText,
  ImageOff,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Moon,
  Printer,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { Surface } from "@/components/opai-ds";

type Props = {
  mode: "html" | "text";
  hasHtml: boolean;
  /** Hay un iframe HTML activo (aplica fondo oscuro y ajuste de ancho). */
  isHtmlFrame: boolean;
  night: boolean;
  /** Solo en tema oscuro de la app; en claro el cuerpo es siempre blanco. */
  showNightToggle?: boolean;
  showImages: boolean;
  blockedAvailable: boolean;
  fitWidth: boolean;
  onToggleMode: () => void;
  onToggleNight: () => void;
  onToggleImages: () => void;
  onAlwaysShowImages?: () => void;
  onToggleFitWidth: () => void;
  onPrint: () => void;
  onClose: () => void;
};

/**
 * Sheet «Vista» del lector móvil: reemplaza la fila de enlaces sueltos de
 * EmailHtmlBody. Ver texto/original · imágenes · fondo · ajuste de ancho ·
 * imprimir. En desktop la fila de enlaces se conserva (este sheet no aplica).
 */
export function CorreoViewSheet({
  mode,
  hasHtml,
  isHtmlFrame,
  night,
  showNightToggle = true,
  showImages,
  blockedAvailable,
  fitWidth,
  onToggleMode,
  onToggleNight,
  onToggleImages,
  onAlwaysShowImages,
  onToggleFitWidth,
  onPrint,
  onClose,
}: Props) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <Surface
        elevation={2}
        padding="md"
        className="w-full space-y-2 rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:max-w-sm md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3 md:hidden" />
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-sm font-semibold text-ds-text-1">Vista del correo</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ds-text-3 ds-tap hover:bg-ds-surface-2 sm:h-9 sm:w-9"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
          {hasHtml && (
            <Row
              icon={mode === "html" ? FileText : Code2}
              label={mode === "html" ? "Ver como texto" : "Ver original (HTML)"}
              onClick={close(onToggleMode)}
            />
          )}
          {blockedAvailable && mode === "html" && (
            <Row
              icon={showImages ? ImageOff : ImageIcon}
              label={showImages ? "Ocultar imágenes" : "Mostrar imágenes"}
              onClick={close(onToggleImages)}
            />
          )}
          {blockedAvailable && mode === "html" && !showImages && onAlwaysShowImages && (
            <Row
              icon={ImageIcon}
              label="Mostrar imágenes siempre"
              onClick={close(onAlwaysShowImages)}
            />
          )}
          {isHtmlFrame && showNightToggle && (
            <Row
              icon={night ? Sun : Moon}
              label={night ? "Fondo claro" : "Fondo oscuro"}
              onClick={close(onToggleNight)}
            />
          )}
          {isHtmlFrame && (
            <Row
              icon={fitWidth ? Maximize2 : Minimize2}
              label={fitWidth ? "Ancho original (100%)" : "Ajustar ancho"}
              onClick={close(onToggleFitWidth)}
            />
          )}
          <Row icon={Printer} label="Imprimir" onClick={close(onPrint)} last />
        </div>
      </Surface>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  onClick,
  last,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 ${
        last ? "" : "border-b border-ds-border-subtle"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 text-ds-text-3" aria-hidden />
      <span className="font-medium">{label}</span>
    </button>
  );
}
