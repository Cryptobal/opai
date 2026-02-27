/**
 * Re-export del Command Palette desde su nuevo módulo.
 * Mantiene compatibilidad con imports existentes.
 */
export { CommandPalette } from './command-palette/CommandPalette';
export { CommandPaletteProvider } from './command-palette/CommandPaletteProvider';
export { useCommandPalette } from './command-palette/use-command-palette';
