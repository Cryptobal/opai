"use client";

/**
 * Listener global del atajo configurable del asistente IA (default ⌘J / Ctrl+J).
 * Solo desktop (teclado físico). Ignora el grabador de atajos y e.repeat.
 */
import { useEffect, useRef } from "react";
import { dispatchAiCommand } from "@/lib/ai/ai-command-event";
import {
  AI_SHORTCUT_CHANGED_EVENT,
  isShortcutRecorderTarget,
  matchesShortcut,
  readAiShortcutConfig,
  type AiShortcutConfig,
} from "@/lib/ai/ai-shortcut";
import { getPaletteBridgeState } from "@/components/opai/command-palette/palette-bridge";
import { useCommandPalette } from "@/components/opai/command-palette/use-command-palette";

export function AiShortcutListener() {
  const { isOpen, close } = useCommandPalette();
  const configRef = useRef<AiShortcutConfig>(readAiShortcutConfig());

  useEffect(() => {
    const sync = () => {
      configRef.current = readAiShortcutConfig();
    };
    sync();
    window.addEventListener(AI_SHORTCUT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AI_SHORTCUT_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const config = configRef.current;
      if (!config.enabled) return;
      if (e.repeat) return;
      if (isShortcutRecorderTarget(e.target)) return;
      if (!matchesShortcut(e, config.combo)) return;

      e.preventDefault();
      e.stopPropagation();

      const bridge = getPaletteBridgeState();
      const paletteOpen = isOpen || bridge.isOpen;
      const query = bridge.query.trim();

      if (paletteOpen) {
        close();
      }

      if (paletteOpen && query && config.sendQueryAsPrompt) {
        dispatchAiCommand({ prompt: query, autoSend: true });
        return;
      }

      if (paletteOpen && query && !config.sendQueryAsPrompt) {
        // Abre el chat sin auto-enviar (toggle off).
        window.dispatchEvent(new Event("opai-ai-open"));
        return;
      }

      window.dispatchEvent(new Event("opai-ai-open"));
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, close]);

  return null;
}
