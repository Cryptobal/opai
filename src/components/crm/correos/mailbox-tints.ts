/** Tint class maps for mailbox color keys (Tailwind JIT needs literals). */
import {
  PALETTE_FG_BG,
  PALETTE_FG_TEXT,
  PALETTE_SOFT,
  paletteFgBg,
  paletteFgText,
  paletteSoft,
} from "@/lib/design/calendar-palette";

export const TINT_BAR: Record<string, string> = { ...PALETTE_FG_BG };

export const TINT_SOFT: Record<string, string> = { ...PALETTE_SOFT };

export const TINT_TEXT: Record<string, string> = { ...PALETTE_FG_TEXT };

export function tintBar(color: string): string {
  return paletteFgBg(color);
}

export function tintSoft(color: string): string {
  return paletteSoft(color);
}

/** Texto con el tint de casilla (sin fondo) — lectura sutil del email. */
export function tintText(color: string): string {
  return paletteFgText(color);
}
