/**
 * TokenSuggestionExtension — Autocompletado de tokens con #
 *
 * Al escribir # en cualquier parte del editor, muestra un listado de tokens
 * filtrable por búsqueda. Enter o clic inserta el token seleccionado.
 */

import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { TOKEN_MODULES } from "@/lib/docs/token-registry";

export interface TokenSuggestionOptions {
  filterModules?: string[];
}

export interface TokenSuggestionItem {
  module: string;
  tokenKey: string;
  label: string;
  moduleLabel: string;
}

const TokenSuggestionPluginKey = new PluginKey("tokenSuggestion");

function getFlatTokens(filterModules?: string[]): TokenSuggestionItem[] {
  const modules = filterModules?.length
    ? TOKEN_MODULES.filter((m) => filterModules.includes(m.key))
    : TOKEN_MODULES;
  const items: TokenSuggestionItem[] = [];
  for (const mod of modules) {
    for (const t of mod.tokens) {
      items.push({
        module: mod.key,
        tokenKey: t.key,
        label: t.label,
        moduleLabel: mod.label,
      });
    }
  }
  return items;
}

function filterTokens(items: TokenSuggestionItem[], query: string): TokenSuggestionItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    (t) =>
      t.label.toLowerCase().includes(q) ||
      t.tokenKey.toLowerCase().includes(q) ||
      t.moduleLabel.toLowerCase().includes(q)
  );
}

export const TokenSuggestionExtension = Extension.create<TokenSuggestionOptions>({
  name: "tokenSuggestion",

  addOptions() {
    return {
      filterModules: undefined as string[] | undefined,
    };
  },

  addProseMirrorPlugins() {
    const ext = this;
    const baseItems = getFlatTokens(ext.options.filterModules);
    const allItems: TokenSuggestionItem[] = [...baseItems];
    let didSelect = false;

    if (ext.options.filterModules?.includes("guardia")) {
      fetch("/api/payroll/bonos?active=false")
        .then((r) => r.json())
        .then((json) => {
          const bonos = json.data || [];
          for (const b of bonos) {
            allItems.push({
              module: "guardia",
              tokenKey: `guardia.bono_${b.code}`,
              label: b.name,
              moduleLabel: "Guardia",
            });
          }
        })
        .catch(() => {});
    }

    return [
      Suggestion<TokenSuggestionItem, TokenSuggestionItem>({
        editor: ext.editor,
        char: "#",
        pluginKey: TokenSuggestionPluginKey,
        allowSpaces: false,
        allowedPrefixes: null,
        command: ({ editor, range, props }) => {
          didSelect = true;
          const signerMatch = /^signature\.signer_(\d+)$/.exec(props.tokenKey);
          const firmaGuardiaMatch = props.tokenKey === "signature.firmaGuardia";
          const signerOrder = signerMatch ? parseInt(signerMatch[1], 10) : firmaGuardiaMatch ? 1 : null;
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertToken({
              module: props.module,
              tokenKey: props.tokenKey,
              label: props.label,
              ...(signerOrder != null && { signerOrder }),
            })
            .insertContent(" ")
            .run();
        },
        items: ({ query }) => filterTokens(allItems, query),
        allow: () => true,
        render: () => {
          let listEl: HTMLDivElement | null = null;
          let selectedIndex = 0;
          let currentItems: TokenSuggestionItem[] = [];
          let currentCommand: ((item: TokenSuggestionItem) => void) | null = null;

          const renderList = (
            items: TokenSuggestionItem[],
            clientRect: (() => DOMRect | null) | null,
            onSelect: (item: TokenSuggestionItem) => void
          ) => {
            if (!listEl) return;
            listEl.innerHTML = "";
            listEl.className =
              "token-suggestion-list fixed z-[100] min-w-[280px] max-h-[320px] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg py-1";
            if (items.length === 0) {
              const empty = document.createElement("div");
              empty.className = "px-3 py-6 text-center text-sm text-muted-foreground";
              empty.textContent = "No hay tokens";
              listEl.appendChild(empty);
              return;
            }
            items.forEach((item, i) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className =
                "w-full text-left px-3 py-2 text-sm flex items-start gap-2 hover:bg-accent hover:text-accent-foreground transition-colors";
              if (i === selectedIndex) btn.classList.add("bg-accent", "text-accent-foreground");
              btn.innerHTML = `
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-medium truncate">${escapeHtml(item.label)}</span>
                  <span class="text-[11px] text-muted-foreground font-mono truncate" title="Para condicionales: {{#if ${escapeHtml(item.tokenKey)}>0}}">${escapeHtml(item.tokenKey)}</span>
                </div>
                <span class="text-xs text-muted-foreground shrink-0">${escapeHtml(item.moduleLabel)}</span>
              `;
              btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                onSelect(item);
              });
              listEl.appendChild(btn);
            });
            const rect = clientRect?.();
            if (rect) {
              listEl.style.left = `${rect.left}px`;
              listEl.style.top = `${rect.bottom + 4}px`;
            }
          };

          function escapeHtml(s: string): string {
            const div = document.createElement("div");
            div.textContent = s;
            return div.innerHTML;
          }

          return {
            onStart: (props) => {
              listEl = document.createElement("div");
              listEl.setAttribute("data-token-suggestion", "true");
              document.body.appendChild(listEl);
              selectedIndex = 0;
              currentItems = props.items;
              currentCommand = props.command;
              renderList(props.items, props.clientRect ?? null, (item) => {
                props.command(item);
              });
            },
            onUpdate: (props) => {
              currentItems = props.items;
              currentCommand = props.command;
              selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1));
              renderList(props.items, props.clientRect ?? null, (item) => {
                props.command(item);
              });
              const buttons = listEl?.querySelectorAll("button");
              buttons?.forEach((b, i) => {
                b.classList.toggle("bg-accent", i === selectedIndex);
                b.classList.toggle("text-accent-foreground", i === selectedIndex);
              });
            },
            onKeyDown: ({ event }) => {
              if (event.key === "ArrowDown") {
                if (currentItems.length > 0) {
                  selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1);
                  const buttons = listEl?.querySelectorAll("button");
                  buttons?.forEach((b, i) => {
                    b.classList.toggle("bg-accent", i === selectedIndex);
                    b.classList.toggle("text-accent-foreground", i === selectedIndex);
                  });
                  buttons?.[selectedIndex]?.scrollIntoView({ block: "nearest" });
                }
                return true;
              }
              if (event.key === "ArrowUp") {
                if (currentItems.length > 0) {
                  selectedIndex = Math.max(selectedIndex - 1, 0);
                  const buttons = listEl?.querySelectorAll("button");
                  buttons?.forEach((b, i) => {
                    b.classList.toggle("bg-accent", i === selectedIndex);
                    b.classList.toggle("text-accent-foreground", i === selectedIndex);
                  });
                  buttons?.[selectedIndex]?.scrollIntoView({ block: "nearest" });
                }
                return true;
              }
              if (event.key === "Enter") {
                if (currentItems[selectedIndex] && currentCommand) {
                  currentCommand(currentItems[selectedIndex]);
                  return true;
                }
              }
              return false;
            },
            onExit: (props) => {
              // Al cerrar sin seleccionar (Esc), eliminar el # y lo escrito
              if (!didSelect && props.range && ext.editor) {
                ext.editor.chain().focus().deleteRange(props.range).run();
              }
              didSelect = false;
              listEl?.remove();
              listEl = null;
            },
          };
        },
      }),
    ];
  },
});
