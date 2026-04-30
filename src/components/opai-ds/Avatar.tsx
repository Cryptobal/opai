import { cn } from "@/lib/utils";

export type AvatarVariant = "default" | "ok" | "warn" | "danger" | "brand" | "neutral";

export interface AvatarProps {
  /** Iniciales (típicamente 2 letras). Requerido si no hay photoUrl ni name. */
  initials?: string;
  /** URL de foto. Si se provee, prevalece sobre las iniciales. */
  photoUrl?: string | null;
  /** Nombre para alt text de la foto y fallback de iniciales. */
  name?: string;
  variant?: AvatarVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const VARIANT_BG: Record<AvatarVariant, string> = {
  default: "bg-gradient-to-br from-ds-text-1/15 to-ds-text-1/5 text-ds-text-1",
  ok:      "bg-gradient-to-br from-status-ok to-status-ok/70 text-white",
  warn:    "bg-gradient-to-br from-status-warn to-status-warn/70 text-white",
  danger:  "bg-gradient-to-br from-status-danger to-status-danger/70 text-white",
  brand:   "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
  neutral: "bg-ds-surface-3 border border-dashed border-ds-border-default text-ds-text-3",
};

const SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[11px]",
  lg: "h-11 w-11 text-[13px]",
};

const SIZE_BOX_ONLY: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

function deriveInitials(initials: string | undefined, name: string | undefined): string {
  if (initials) return initials.toUpperCase().slice(0, 2);
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ initials, photoUrl, name, variant = "default", size = "md", className }: AvatarProps) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name ?? "Avatar"}
        className={cn(
          "shrink-0 rounded-full object-cover ds-ring-inset",
          SIZE_BOX_ONLY[size],
          className,
        )}
      />
    );
  }

  const text = deriveInitials(initials, name);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none ds-ring-inset",
        VARIANT_BG[variant],
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      {text}
    </span>
  );
}
