"use client";

import { type CSSProperties, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/**
 * Shell móvil único (v3.1). Toda pantalla móvil se compone de:
 *  (a) pill de header con material de vidrio (opcional);
 *  (b) fila sticky opcional para controles (segmented, filtros, tira de días);
 *  (c) contenedor de scroll enmascarado — el contenido pasa por detrás del
 *      vidrio y se desvanece antes del borde superior; nunca llega nítido al
 *      status bar ni se corta de golpe.
 *
 * Tipos de superficie (ver brief §5):
 *  - Tipo A/B: `fade` activo (default). Con control fijo → pasar `sticky`.
 *  - Tipo C (composer con teclado, visor PDF/imagen, mapas, kiosco de
 *    marcación): `fade={false}` para que el contenido llegue íntegro al borde.
 *
 * No arma navegación propia: se monta bajo la MobileIsland global. El header
 * pill es para pantallas inmersivas o títulos de detalle.
 */
export type MobileScreenShellProps = {
  /** Título del header pill. Si se omite (y sin back/trailing) no se renderiza. */
  title?: ReactNode;
  /** Botón volver en el header pill. */
  onBack?: () => void;
  /** Acciones al final del header pill (chips, botones ≥44px). */
  trailing?: ReactNode;
  /** Fila de controles fijos bajo el header (material denso + blur). */
  sticky?: ReactNode;
  /** Punto (px) donde el contenido pasa a opaco bajo el header. Default 112. */
  fadeTop?: number;
  /** Desvanecido inferior (px) sobre la bottom-nav. Default 44. */
  fadeBot?: number;
  /** Desactiva la máscara (superficies Tipo C). Default true. */
  fade?: boolean;
  className?: string;
  /** Clase del contenedor de scroll (padding, etc.). */
  contentClassName?: string;
  children: ReactNode;
};

export function MobileScreenShell({
  title,
  onBack,
  trailing,
  sticky,
  fadeTop = 112,
  fadeBot = 44,
  fade = true,
  className = "",
  contentClassName = "",
  children,
}: MobileScreenShellProps) {
  const hasHeader = Boolean(title || onBack || trailing);
  const fadeVars = {
    "--fade-top": `${fadeTop}px`,
    "--fade-bot": `${fadeBot}px`,
  } as CSSProperties;

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${className}`}>
      {hasHeader && (
        <div className="px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <div className="opai-glass-strong flex min-h-12 items-center gap-2 rounded-[22px] px-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Volver"
                className="ds-tap -ml-0.5 grid h-11 w-11 place-items-center rounded-xl text-ds-text-2"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {title && (
              <div className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold text-ds-text-1">
                {title}
              </div>
            )}
            {trailing && (
              <div className="flex shrink-0 items-center gap-1">{trailing}</div>
            )}
          </div>
        </div>
      )}

      {sticky && (
        <div className="opai-glass-strong-m z-10 mx-3 mt-2 rounded-[20px] px-2 py-1.5">
          {sticky}
        </div>
      )}

      <div
        className={`min-h-0 flex-1 overflow-y-auto ${fade ? "mobile-scroll-fade" : ""} ${contentClassName}`}
        style={fade ? fadeVars : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export default MobileScreenShell;
