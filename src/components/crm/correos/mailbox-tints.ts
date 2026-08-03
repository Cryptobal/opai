/** Tint class maps for mailbox color keys (Tailwind JIT needs literals). */
import {
  PALETTE_FG_BG,
  PALETTE_SOFT,
  paletteFgBg,
  paletteSoft,
} from "@/lib/design/calendar-palette";

export const TINT_BAR: Record<string, string> = { ...PALETTE_FG_BG };

export const TINT_SOFT: Record<string, string> = { ...PALETTE_SOFT };

export function tintBar(color: string): string {
  return paletteFgBg(color);
}

export function tintSoft(color: string): string {
  return paletteSoft(color);
}
