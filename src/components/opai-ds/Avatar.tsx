import { cn } from "@/lib/utils";
import { tintClasses, type EntityTint } from "@/lib/entity-tint";

export type AvatarVariant =
  | "default"
  | "ok"
  | "warn"
  | "danger"
  | "brand"
  | "neutral"
  | "tint";

export interface AvatarProps {
  /** Iniciales (típicamente 2 letras). Requerido si no hay photoUrl ni name. */
  initials?: string;
  /** URL de foto. Si se provee, prevalece sobre las iniciales. */
  photoUrl?: string | null;
  /** Nombre para alt text de la foto y fallback de iniciales. */
  name?: string;
  variant?: AvatarVariant;
  /** Tint categórico — solo aplica cuando variant="tint". */
  tint?: EntityTint;
  /** Forma del avatar. Default circle para no alterar consumidores existentes. */
  shape?: "circle" | "square";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const VARIANT_BG: Record<Exclude<AvatarVariant, "tint">, string> = {
  default: "bg-gradient-to-br from-ds-text-1/15 to-ds-text-1/5 text-ds-text-1",
  ok:      "bg-gradient-to-br from-status-ok to-status-ok/70 text-white",
  warn:    "bg-gradient-to-br from-status-warn to-status-warn/70 text-white",
  danger:  "bg-gradient-to-br from-status-danger to-status-danger/70 text-white",
  brand:   "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
  neutral: "bg-ds-surface-3 border border-dashed border-ds-border-default text-ds-text-3",
};

const SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-ds-caption",
  md: "h-9 w-9 text-ds-caption",
  lg: "h-11 w-11 text-ds-body",
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

export function Avatar({
  initials,
  photoUrl,
  name,
  variant = "default",
  tint = "teal",
  shape = "circle",
  size = "md",
  className,
}: AvatarProps) {
  const shapeClass = shape === "square" ? "rounded-ds-sm" : "rounded-full";

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name ?? "Avatar"}
        className={cn(
          "shrink-0 object-cover ds-ring-inset",
          shapeClass,
          SIZE_BOX_ONLY[size],
          className,
        )}
      />
    );
  }

  const text = deriveInitials(initials, name);
  const tintCls = variant === "tint" ? tintClasses(tint) : null;
  const variantCls =
    variant === "tint"
      ? cn(tintCls!.bg, tintCls!.fg)
      : VARIANT_BG[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-semibold shrink-0 select-none ds-ring-inset",
        shapeClass,
        variantCls,
        SIZE[size],
        className,
      )}
      aria-hidden
    >
      {text}
    </span>
  );
}
