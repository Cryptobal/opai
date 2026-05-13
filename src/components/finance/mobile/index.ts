// Primitivas mobile-first para módulos de Finanzas (DTE Emitidos,
// DTE Recibidos, Bancos, Conciliación). Pensadas para usarse detrás
// de `md:hidden` sin afectar la UI desktop existente.
//
// Patrón: leer cashflow/CashflowMobile* como referencia de estilo
// (tipografía, tones, targets táctiles ≥48px, sticky chips).

export {
  MobileActionSheet,
  type MobileActionSheetItem,
} from "./MobileActionSheet";
export {
  MobileFilterChips,
  type MobileFilterChip,
} from "./MobileFilterChips";
export { MobileSearchBar } from "./MobileSearchBar";
export { MobileFAB } from "./MobileFAB";
export { MobileKVRow, MobileKVList } from "./MobileKVRow";
