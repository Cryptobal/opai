"use client";

import { Check } from "lucide-react";
import { parseSender, senderColorIndex } from "./correo-sender";

/** Paleta categórica de avatares — 1:1 con SENDER_PALETTE_SIZE (tokens DS). */
const PALETTE = [
  "bg-tint-violet text-tint-violet-fg",
  "bg-tint-rose text-tint-rose-fg",
  "bg-tint-amber text-tint-amber-fg",
  "bg-tint-emerald text-tint-emerald-fg",
  "bg-tint-sky text-tint-sky-fg",
  "bg-tint-teal text-tint-teal-fg",
];

type Props = {
  fromEmail: string | null;
  /** Foto real (Admin OPAI o Google People). Si hay, reemplaza iniciales. */
  photoUrl?: string | null;
  /** Densidad 1 línea: círculo de 32px en vez de 40px. */
  compact?: boolean;
  /** Modo selección: el avatar muta a un check primario (morph ~150ms). */
  checked?: boolean;
  /** Hit-target propio (tap = alternar selección, como Gmail). */
  onPress?: () => void;
};

/** Avatar de remitente estilo Gmail: foto si hay, si no iniciales + color. */
export function CorreoSenderAvatar({
  fromEmail,
  photoUrl,
  compact,
  checked,
  onPress,
}: Props) {
  const sender = parseSender(fromEmail);
  const tint = PALETTE[senderColorIndex(sender.email)] ?? PALETTE[0];
  const size = compact ? "h-8 w-8" : "h-10 w-10";
  const circle = `absolute inset-0 flex items-center justify-center rounded-full transition-all duration-150`;

  const face = (
    <span aria-hidden className={`relative block shrink-0 ${size}`}>
      {photoUrl && !checked ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      ) : (
        <span
          className={`${circle} ${tint} ${compact ? "text-[13px]" : "text-sm"} font-semibold ${
            checked ? "scale-0 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          {sender.initials}
        </span>
      )}
      <span
        className={`${circle} bg-primary text-primary-foreground ${
          checked ? "scale-100 opacity-100" : "scale-0 opacity-0"
        }`}
      >
        <Check className="h-5 w-5" />
      </span>
    </span>
  );

  if (!onPress) return face;

  return (
    <button
      type="button"
      aria-pressed={Boolean(checked)}
      aria-label={
        checked
          ? "Quitar de la selección"
          : `Seleccionar correo de ${sender.name || sender.email || "remitente"}`
      }
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className="-m-1 shrink-0 rounded-full p-1 ds-tap"
    >
      {face}
    </button>
  );
}
