import { cn } from "@/lib/utils";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Si se quiere un texto al lado, "Cargando…" estilo system. */
  label?: string;
  /** Centrar y dar padding (para empty / loading screens). */
  block?: boolean;
  className?: string;
}

const SIZE = {
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-7 w-7 border-[2.5px]",
};

export function Spinner({ size = "md", label, block = false, className }: SpinnerProps) {
  const spinner = (
    <span
      role="status"
      aria-label={label ?? "Cargando"}
      className={cn(
        "inline-block animate-spin rounded-full border-current border-r-transparent text-ds-text-3",
        SIZE[size],
        className,
      )}
    />
  );

  if (block) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        {spinner}
        {label && <span className="text-sm text-ds-text-3">{label}</span>}
      </div>
    );
  }

  if (label) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ds-text-3">
        {spinner}
        {label}
      </span>
    );
  }

  return spinner;
}
