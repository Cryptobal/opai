/**
 * Tipos del componente compartido <PositionMatrix>.
 *
 * El componente es modo-agnóstico: NO conoce la persistencia. Recibe un
 * adapter (CPQ vía API o Lead en memoria) que normaliza los datos a esta
 * forma única y traduce las mutaciones de vuelta a su modelo nativo.
 */
export interface CpqCatalogOption {
  id: string;
  name: string;
  colorHex?: string | null;
  /** Sueldo bruto sugerido (CLP). Solo aplica a roles. */
  salary?: number | null;
}

/** Turno normalizado — forma única compartida entre CPQ y Lead. */
export interface NormalizedShift {
  id: string;
  /** null = "Sin agrupar" */
  groupKey: string | null;
  puestoId: string;
  cargoId: string;
  rolId: string;
  /** "HH:MM" */
  inicio: string;
  fin: string;
  /** weekdays canónicos cortos ("Lun", "Mar", …) */
  dias: string[];
  guardias: number;
  nPuestos: number;
  bruto: number;
  /** líquido por guardia (persistido) — el editor calcula uno en vivo al teclear */
  liquido?: number | null;
  /** costo empresa mensual del turno completo (guardias × puestos) */
  costo?: number | null;
  /** costo empresa por guardia */
  costoPorGuardia?: number | null;
}

export interface NormalizedGroup {
  key: string;
  name: string;
  pattern?: string | null;
  order: number;
}

/** Campos editables que el editor envía de vuelta al adapter. */
export type ShiftPatch = Partial<
  Pick<
    NormalizedShift,
    "puestoId" | "cargoId" | "rolId" | "inicio" | "fin" | "dias" | "guardias" | "nPuestos" | "bruto"
  >
>;

/** Fila semilla generada por una plantilla de cobertura. */
export interface TemplateRowSeed {
  inicio: string;
  fin: string;
  dias: string[];
  guardias: number;
  nPuestos: number;
  bruto: number;
}

export interface PositionMatrixAdapter {
  rows: NormalizedShift[];
  groups: NormalizedGroup[];
  catalogs: {
    puestos: CpqCatalogOption[];
    cargos: CpqCatalogOption[];
    roles: CpqCatalogOption[];
  };
  currency: string;
  ufValue?: number | null;
  readOnly?: boolean;
  /** id de la fila persistiéndose (muestra spinner). Opcional. */
  savingRowId?: string | null;
  /**
   * Si true, el editor NO hace el fetch de líquido en vivo y usa los valores
   * `liquido`/`costoPorGuardia` provistos por el adapter (caso Lead, que ya
   * calcula payrollPreview en el padre).
   */
  disableLivePreview?: boolean;

  onAddRow(groupKey: string | null): void;
  onUpdateRow(id: string, patch: ShiftPatch): void;
  onCloneRow(id: string): void;
  onDeleteRow(id: string): void;
  onRenameGroup(groupKey: string, name: string): void;
  onDeleteGroup?(groupKey: string): void;
  onAddGroup(name: string, templateRows?: TemplateRowSeed[]): void;
}
