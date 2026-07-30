/**
 * Atajo de teclado configurable para abrir el asistente IA.
 * Persistencia localStorage por dispositivo (mismo patrón que useHelpChatController).
 */

export const AI_SHORTCUT_KEY = "opai-ai-shortcut";
export const AI_SHORTCUT_ENABLED_KEY = "opai-ai-shortcut-enabled";
export const AI_SHORTCUT_SEND_QUERY_KEY = "opai-ai-shortcut-send-query";
/** Marca el grabador de atajos para que el listener global lo ignore. */
export const AI_SHORTCUT_RECORDER_ATTR = "data-opai-ai-shortcut-recorder";

export const AI_SHORTCUT_CHANGED_EVENT = "opai-ai-shortcut-changed";

/** Combo canónico: `mod` = ⌘ en macOS / Ctrl en Windows/Linux. */
export type ShortcutCombo = {
  key: string;
  mod: boolean;
  shift?: boolean;
  alt?: boolean;
};

export const DEFAULT_AI_SHORTCUT: ShortcutCombo = { key: "j", mod: true };

/** Combos reservados del navegador + ⌘K del palette. */
export const RESERVED_COMBOS: ShortcutCombo[] = [
  { key: "w", mod: true },
  { key: "t", mod: true },
  { key: "n", mod: true },
  { key: "l", mod: true },
  { key: "q", mod: true },
  { key: "k", mod: true },
];

export const AI_SHORTCUT_PRESETS: { combo: ShortcutCombo; label: string; recommended?: boolean }[] =
  [
    { combo: { key: "j", mod: true }, label: "J", recommended: true },
    { combo: { key: "i", mod: true }, label: "I" },
    { combo: { key: "k", mod: true, shift: true }, label: "⇧K" },
    { combo: { key: ".", mod: true }, label: "." },
  ];

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function modSymbol(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

function normalizeKey(key: string): string {
  if (key === " ") return "space";
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}

export function serializeCombo(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.mod) parts.push("mod");
  if (combo.shift) parts.push("shift");
  if (combo.alt) parts.push("alt");
  parts.push(normalizeKey(combo.key));
  return parts.join("+");
}

export function parseCombo(raw: string | null | undefined): ShortcutCombo | null {
  if (!raw?.trim()) return null;
  const parts = raw.trim().toLowerCase().split("+").filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts[parts.length - 1];
  if (!key) return null;
  return {
    key,
    mod: parts.includes("mod") || parts.includes("meta") || parts.includes("ctrl") || parts.includes("cmd"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
  };
}

export function formatCombo(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(modSymbol());
  if (combo.alt) parts.push(isMacPlatform() ? "⌥" : "Alt");
  if (combo.shift) parts.push(isMacPlatform() ? "⇧" : "Shift");
  const k = combo.key.length === 1 ? combo.key.toUpperCase() : combo.key;
  parts.push(k);
  return parts.join(isMacPlatform() ? "" : "+");
}

export function combosEqual(a: ShortcutCombo, b: ShortcutCombo): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  );
}

export function isReservedCombo(combo: ShortcutCombo): boolean {
  return RESERVED_COMBOS.some((r) => combosEqual(r, combo));
}

export type ShortcutValidation =
  | { ok: true }
  | { ok: false; reason: string };

export function validateCombo(combo: ShortcutCombo | null): ShortcutValidation {
  if (!combo || !combo.key) {
    return { ok: false, reason: "Captura una tecla con modificador." };
  }
  if (!combo.mod) {
    return {
      ok: false,
      reason: `Debe incluir ${modSymbol()} (o Ctrl).`,
    };
  }
  if (isReservedCombo(combo)) {
    return {
      ok: false,
      reason: `${formatCombo(combo)} está reservado (navegador o buscador ⌘K).`,
    };
  }
  return { ok: true };
}

export function matchesShortcut(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  if (e.repeat) return false;
  const modPressed = e.metaKey || e.ctrlKey;
  if (Boolean(combo.mod) !== modPressed) return false;
  if (Boolean(combo.shift) !== e.shiftKey) return false;
  if (Boolean(combo.alt) !== e.altKey) return false;
  return normalizeKey(e.key) === normalizeKey(combo.key);
}

export type AiShortcutConfig = {
  enabled: boolean;
  combo: ShortcutCombo;
  sendQueryAsPrompt: boolean;
};

export function readAiShortcutConfig(): AiShortcutConfig {
  if (typeof window === "undefined") {
    return {
      enabled: true,
      combo: DEFAULT_AI_SHORTCUT,
      sendQueryAsPrompt: true,
    };
  }
  const enabledRaw = localStorage.getItem(AI_SHORTCUT_ENABLED_KEY);
  const sendRaw = localStorage.getItem(AI_SHORTCUT_SEND_QUERY_KEY);
  const combo =
    parseCombo(localStorage.getItem(AI_SHORTCUT_KEY)) ?? DEFAULT_AI_SHORTCUT;
  return {
    enabled: enabledRaw === null ? true : enabledRaw === "1",
    combo,
    sendQueryAsPrompt: sendRaw === null ? true : sendRaw === "1",
  };
}

export function writeAiShortcutConfig(partial: Partial<AiShortcutConfig>): AiShortcutConfig {
  const current = readAiShortcutConfig();
  const next: AiShortcutConfig = {
    enabled: partial.enabled ?? current.enabled,
    combo: partial.combo ?? current.combo,
    sendQueryAsPrompt: partial.sendQueryAsPrompt ?? current.sendQueryAsPrompt,
  };
  localStorage.setItem(AI_SHORTCUT_ENABLED_KEY, next.enabled ? "1" : "0");
  localStorage.setItem(AI_SHORTCUT_SEND_QUERY_KEY, next.sendQueryAsPrompt ? "1" : "0");
  localStorage.setItem(AI_SHORTCUT_KEY, serializeCombo(next.combo));
  window.dispatchEvent(new CustomEvent(AI_SHORTCUT_CHANGED_EVENT, { detail: next }));
  return next;
}

export function isShortcutRecorderTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(`[${AI_SHORTCUT_RECORDER_ATTR}]`) ||
      target.getAttribute(AI_SHORTCUT_RECORDER_ATTR) != null,
  );
}
