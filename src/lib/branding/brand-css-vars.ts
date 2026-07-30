import { hexToHslComponents, withLightness } from "@/lib/branding/hex-to-hsl";

/**
 * Genera un bloque CSS `:root { … }` con el acento del tenant y superficies dark.
 * Hex inválido → cadena vacía (no se emite `<style>` vacío).
 */
export function brandCssVars(opts: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
}): string {
  const accent =
    hexToHslComponents(opts.accentColor ?? "") ??
    hexToHslComponents(opts.secondaryColor ?? "");
  const navy = hexToHslComponents(opts.primaryColor ?? "");

  if (!accent && !navy) return "";

  const lines: string[] = [];
  if (accent) {
    lines.push(`--primary:${accent};`);
    lines.push(`--ring:${accent};`);
  }
  if (navy) {
    const bg = withLightness(navy, 7);
    // Solo aplica superficies dark; el tema claro conserva tokens DS.
    lines.push(`--opai-brand-navy:${navy};`);
    lines.push(`--opai-brand-bg:${bg};`);
    lines.push(`--opai-brand-card:${withLightness(navy, 11)};`);
    lines.push(`--opai-brand-popover:${withLightness(navy, 14)};`);
    lines.push(`--opai-brand-s0:${bg};`);
    lines.push(`--opai-brand-s1:${withLightness(navy, 11)};`);
    lines.push(`--opai-brand-s2:${withLightness(navy, 14)};`);
    lines.push(`--opai-brand-s3:${withLightness(navy, 17)};`);
  }

  if (!lines.length) return "";

  // Dark surfaces se activan solo con `.dark` para no romper light.
  const darkBlock = navy
    ? `.dark{--background:var(--opai-brand-bg);--card:var(--opai-brand-card);--popover:var(--opai-brand-popover);--ds-surface-0:var(--opai-brand-s0);--ds-surface-1:var(--opai-brand-s1);--ds-surface-2:var(--opai-brand-s2);--ds-surface-3:var(--opai-brand-s3);}`
    : "";

  return `:root{${lines.join("")}}${darkBlock}`;
}
