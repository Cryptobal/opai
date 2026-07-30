/**
 * Bridge mínimo para que AiShortcutListener lea el estado del palette
 * sin acoplar el query (estado local del CommandPalette) al Context.
 */

type PaletteBridgeState = {
  isOpen: boolean;
  query: string;
};

let state: PaletteBridgeState = { isOpen: false, query: "" };

export function setPaletteBridgeState(next: Partial<PaletteBridgeState>): void {
  state = { ...state, ...next };
}

export function getPaletteBridgeState(): PaletteBridgeState {
  return state;
}
