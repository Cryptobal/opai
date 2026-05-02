import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  title: ReactNode;
  /** Texto secundario debajo del título. Estilo metadata, peso normal. */
  hint?: ReactNode;
  /** Texto pequeño en monospace estilo "war room". Va arriba del título. */
  eyebrow?: ReactNode;
  /** Acciones a la derecha (botones, links). */
  actions?: ReactNode;
  className?: string;
  /** Tamaño del título. md = secciones internas, lg = encabezados de página. */
  size?: "sm" | "md" | "lg";
}

const TITLE_SIZE = {
  sm: "text-sm font-semibold tracking-tight",
  md: "text-base font-semibold tracking-tight",
  lg: "font-display text-2xl font-bold tracking-tight",
};

export function SectionHeader({
  title,
  hint,
  eyebrow,
  actions,
  className,
  size = "md",
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
            {eyebrow}
          </p>
        )}
        <h2 className={cn(TITLE_SIZE[size], "text-ds-text-1")}>{title}</h2>
        {hint && (
          <p className="mt-1 text-[13px] text-ds-text-3 leading-relaxed">{hint}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
