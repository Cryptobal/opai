import { cn } from "@/lib/utils";

export type LoadingSpinnerSize = "sm" | "md";

export interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  className?: string;
  title?: string;
}

/**
 * LoadingSpinner - Círculo discreto y minimalista para estados de carga.
 * Usado en módulos de Pautas (mensual, diaria, turnos extra, PPC, refuerzos, auditoría).
 */
export function LoadingSpinner({
  size = "sm",
  className,
  title = "Cargando…",
}: LoadingSpinnerProps) {
  const sizeClasses =
    size === "sm"
      ? "w-4 h-4 border-2 border-muted-foreground/30 border-t-primary/70"
      : "w-6 h-6 border-2 border-muted-foreground/25 border-t-primary/60";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        size === "sm" && "w-5 h-5",
        className
      )}
      title={title}
      aria-hidden
    >
      <span className={cn("rounded-full animate-spin", sizeClasses)} />
    </span>
  );
}
