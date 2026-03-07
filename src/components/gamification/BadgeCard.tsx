"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/utils";
import type { BadgeData } from "./types";

/* ─── Icon mapping ─── */

const BADGE_EMOJI: Record<string, string> = {
  puntualidad: "\u23F0", // alarm clock
  rondero: "\uD83D\uDEE1\uFE0F", // shield
  velocista: "\u26A1", // lightning
  mentor: "\uD83C\uDF93", // graduation cap
  estrella: "\u2B50", // star
  fuego: "\uD83D\uDD25", // fire
  perfecto: "\uD83C\uDFC6", // trophy
  nocturno: "\uD83C\uDF19", // crescent moon
  social: "\uD83E\uDD1D", // handshake
  digital: "\uD83D\uDCF1", // mobile phone
  capitan: "\uD83C\uDF96\uFE0F", // military medal
  lider: "\uD83D\uDC51", // crown
  guardian: "\uD83D\uDC82", // guard
  invencible: "\uD83D\uDCAA", // flexed biceps
  veterano: "\uD83C\uDF1F", // glowing star
};

function getBadgeEmoji(icono: string): string {
  return BADGE_EMOJI[icono.toLowerCase()] ?? "\uD83C\uDFC5"; // default: sports medal
}

/* ─── Props ─── */

interface BadgeCardProps {
  badge: BadgeData;
  compact?: boolean;
  onClick?: (badge: BadgeData) => void;
}

/* ─── Component ─── */

export function BadgeCard({ badge, compact = false, onClick }: BadgeCardProps) {
  const isEarned = badge.ganado;
  const emoji = getBadgeEmoji(badge.icono);

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(badge) : undefined}
      className={cn(
        "group relative flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-center transition-colors",
        compact && "gap-0.5 p-2",
        isEarned
          ? "bg-card hover:border-primary/40 hover:bg-card/80"
          : "cursor-default opacity-50",
        onClick && isEarned && "cursor-pointer"
      )}
    >
      {/* Icon area */}
      <div className="relative">
        <span
          className={cn(
            "text-2xl",
            compact && "text-xl",
            !isEarned && "grayscale"
          )}
        >
          {emoji}
        </span>

        {/* Lock overlay for unearned */}
        {!isEarned && (
          <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-muted p-0.5">
            <Lock size={10} className="text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={cn(
          "text-xs font-medium leading-tight text-foreground",
          compact && "text-[10px]",
          !isEarned && "text-muted-foreground"
        )}
      >
        {badge.nombre}
      </span>

      {/* Date (earned) or progress (not earned) */}
      {isEarned && badge.fechaDesbloqueo ? (
        <span className="text-[10px] text-muted-foreground">
          {formatDateShort(badge.fechaDesbloqueo)}
        </span>
      ) : !isEarned && badge.progreso != null ? (
        <span className="text-[10px] text-muted-foreground">
          {Math.round(badge.progreso)}%
        </span>
      ) : null}
    </button>
  );
}
