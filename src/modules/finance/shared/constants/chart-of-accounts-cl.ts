/**
 * Plan de Cuentas Base Chileno
 * Estructura jerarquica: Grupo > Subgrupo > Cuenta > Subcuenta
 * Basado en el estandar IFRS/NIC Chile para PYMES
 */

export type AccountSeedEntry = {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "COST" | "EXPENSE";
  nature: "DEBIT" | "CREDIT";
  level: number;
  parentCode: string | null;
  acceptsEntries: boolean;
  taxCode?: string;
};

export const CHART_OF_ACCOUNTS_CL: AccountSeedEntry[] = [
  // ── 1. ACTIVOS ──
  { code: "1", name: "Activos", type: "ASSET", nature: "DEBIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "1.1", name: "Activos Corrientes", type: "ASSET", nature: "DEBIT", level: 2, parentCode: "1", acceptsEntries: false },
  { code: "1.1.01", name: "Efectivo y Equivalentes", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.01.001", name: "Caja General", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.002", name: "Caja Chica", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.010", name: "Banco Santander CLP", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.011", name: "Banco de Chile CLP", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.012", name: "Banco BCI CLP", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },
  { code: "1.1.01.020", name: "Banco USD", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.01", acceptsEntries: true },

  { code: "1.1.02", name: "Deudores Comerciales", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.02.001", name: "Deudores por Venta", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.002", name: "Documentos por Cobrar", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.003", name: "Deudores en Factoring", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.004", name: "Retencion Factoring", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },
  { code: "1.1.02.009", name: "Estimacion Deudores Incobrables", type: "ASSET", nature: "CREDIT", level: 4, parentCode: "1.1.02", acceptsEntries: true },

  { code: "1.1.03", name: "Impuestos por Recuperar", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.03.001", name: "IVA Credito Fiscal", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.03", acceptsEntries: true, taxCode: "CF" },
  { code: "1.1.03.002", name: "PPM por Recuperar", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.03", acceptsEntries: true },
  { code: "1.1.03.003", name: "Remanente IVA", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.03", acceptsEntries: true },

  { code: "1.1.04", name: "Anticipos y Otros", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.1", acceptsEntries: false },
  { code: "1.1.04.001", name: "Anticipos a Proveedores", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.04", acceptsEntries: true },
  { code: "1.1.04.002", name: "Gastos Pagados por Anticipado", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.1.04", acceptsEntries: true },

  { code: "1.2", name: "Activos No Corrientes", type: "ASSET", nature: "DEBIT", level: 2, parentCode: "1", acceptsEntries: false },
  { code: "1.2.01", name: "Propiedad, Planta y Equipo", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.2", acceptsEntries: false },
  { code: "1.2.01.001", name: "Vehiculos", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },
  { code: "1.2.01.002", name: "Equipos de Computacion", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },
  { code: "1.2.01.003", name: "Muebles y Enseres", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },
  { code: "1.2.01.009", name: "Depreciacion Acumulada", type: "ASSET", nature: "CREDIT", level: 4, parentCode: "1.2.01", acceptsEntries: true },

  { code: "1.2.02", name: "Intangibles", type: "ASSET", nature: "DEBIT", level: 3, parentCode: "1.2", acceptsEntries: false },
  { code: "1.2.02.001", name: "Software y Licencias", type: "ASSET", nature: "DEBIT", level: 4, parentCode: "1.2.02", acceptsEntries: true },
  { code: "1.2.02.009", name: "Amortizacion Acumulada", type: "ASSET", nature: "CREDIT", level: 4, parentCode: "1.2.02", acceptsEntries: true },

  // ── 2. PASIVOS ──
  { code: "2", name: "Pasivos", type: "LIABILITY", nature: "CREDIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "2.1", name: "Pasivos Corrientes", type: "LIABILITY", nature: "CREDIT", level: 2, parentCode: "2", acceptsEntries: false },
  { code: "2.1.01", name: "Proveedores", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.1", acceptsEntries: false },
  { code: "2.1.01.001", name: "Proveedores Nacionales", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.01", acceptsEntries: true },
  { code: "2.1.01.002", name: "Documentos por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.01", acceptsEntries: true },
  { code: "2.1.01.003", name: "Acreedores Varios", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.01", acceptsEntries: true },

  { code: "2.1.02", name: "Impuestos por Pagar", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.1", acceptsEntries: false },
  { code: "2.1.02.001", name: "IVA Debito Fiscal", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true, taxCode: "DF" },
  { code: "2.1.02.002", name: "Retencion Impuesto Unico", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true },
  { code: "2.1.02.003", name: "PPM por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true },
  { code: "2.1.02.004", name: "Impuesto Renta por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.02", acceptsEntries: true },

  { code: "2.1.03", name: "Remuneraciones por Pagar", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.1", acceptsEntries: false },
  { code: "2.1.03.001", name: "Sueldos por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },
  { code: "2.1.03.002", name: "AFP por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },
  { code: "2.1.03.003", name: "Salud por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },
  { code: "2.1.03.004", name: "Vacaciones por Pagar", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.1.03", acceptsEntries: true },

  { code: "2.2", name: "Pasivos No Corrientes", type: "LIABILITY", nature: "CREDIT", level: 2, parentCode: "2", acceptsEntries: false },
  { code: "2.2.01", name: "Obligaciones Financieras LP", type: "LIABILITY", nature: "CREDIT", level: 3, parentCode: "2.2", acceptsEntries: false },
  { code: "2.2.01.001", name: "Prestamos Bancarios LP", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.2.01", acceptsEntries: true },
  { code: "2.2.01.002", name: "Provision Indemnizacion Anios Servicio", type: "LIABILITY", nature: "CREDIT", level: 4, parentCode: "2.2.01", acceptsEntries: true },

  // ── 3. PATRIMONIO ──
  { code: "3", name: "Patrimonio", type: "EQUITY", nature: "CREDIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "3.1", name: "Capital", type: "EQUITY", nature: "CREDIT", level: 2, parentCode: "3", acceptsEntries: false },
  { code: "3.1.01", name: "Capital Social", type: "EQUITY", nature: "CREDIT", level: 3, parentCode: "3.1", acceptsEntries: false },
  { code: "3.1.01.001", name: "Capital Pagado", type: "EQUITY", nature: "CREDIT", level: 4, parentCode: "3.1.01", acceptsEntries: true },

  { code: "3.2", name: "Resultados", type: "EQUITY", nature: "CREDIT", level: 2, parentCode: "3", acceptsEntries: false },
  { code: "3.2.01", name: "Resultados Acumulados", type: "EQUITY", nature: "CREDIT", level: 3, parentCode: "3.2", acceptsEntries: false },
  { code: "3.2.01.001", name: "Utilidades Retenidas", type: "EQUITY", nature: "CREDIT", level: 4, parentCode: "3.2.01", acceptsEntries: true },
  { code: "3.2.01.002", name: "Perdidas Acumuladas", type: "EQUITY", nature: "DEBIT", level: 4, parentCode: "3.2.01", acceptsEntries: true },
  { code: "3.2.01.003", name: "Resultado del Ejercicio", type: "EQUITY", nature: "CREDIT", level: 4, parentCode: "3.2.01", acceptsEntries: true },

  // ── 4. INGRESOS ──
  { code: "4", name: "Ingresos", type: "REVENUE", nature: "CREDIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "4.1", name: "Ingresos de Explotacion", type: "REVENUE", nature: "CREDIT", level: 2, parentCode: "4", acceptsEntries: false },
  { code: "4.1.01", name: "Ventas de Servicios", type: "REVENUE", nature: "CREDIT", level: 3, parentCode: "4.1", acceptsEntries: false },
  { code: "4.1.01.001", name: "Ingresos por Servicios de Seguridad", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.1.01", acceptsEntries: true },
  { code: "4.1.01.002", name: "Ingresos por Servicios Exentos", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.1.01", acceptsEntries: true },
  { code: "4.1.01.003", name: "Ingresos por Horas Extra", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.1.01", acceptsEntries: true },

  { code: "4.2", name: "Otros Ingresos", type: "REVENUE", nature: "CREDIT", level: 2, parentCode: "4", acceptsEntries: false },
  { code: "4.2.01", name: "Ingresos Financieros", type: "REVENUE", nature: "CREDIT", level: 3, parentCode: "4.2", acceptsEntries: false },
  { code: "4.2.01.001", name: "Intereses Ganados", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.2.01", acceptsEntries: true },
  { code: "4.2.01.002", name: "Diferencia de Cambio Favorable", type: "REVENUE", nature: "CREDIT", level: 4, parentCode: "4.2.01", acceptsEntries: true },

  // ── 5. COSTOS ──
  { code: "5", name: "Costos", type: "COST", nature: "DEBIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "5.1", name: "Costos de Explotacion", type: "COST", nature: "DEBIT", level: 2, parentCode: "5", acceptsEntries: false },
  { code: "5.1.01", name: "Costo de Personal Operativo", type: "COST", nature: "DEBIT", level: 3, parentCode: "5.1", acceptsEntries: false },
  { code: "5.1.01.001", name: "Remuneraciones Guardias", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },
  { code: "5.1.01.002", name: "Leyes Sociales Guardias", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },
  { code: "5.1.01.003", name: "Uniformes y EPP", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },
  { code: "5.1.01.004", name: "Capacitacion Guardias", type: "COST", nature: "DEBIT", level: 4, parentCode: "5.1.01", acceptsEntries: true },

  // ── 6. GASTOS ──
  { code: "6", name: "Gastos", type: "EXPENSE", nature: "DEBIT", level: 1, parentCode: null, acceptsEntries: false },
  { code: "6.1", name: "Gastos de Administracion", type: "EXPENSE", nature: "DEBIT", level: 2, parentCode: "6", acceptsEntries: false },
  { code: "6.1.01", name: "Gastos de Personal Admin", type: "EXPENSE", nature: "DEBIT", level: 3, parentCode: "6.1", acceptsEntries: false },
  { code: "6.1.01.001", name: "Remuneraciones Administrativas", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.01", acceptsEntries: true },
  { code: "6.1.01.002", name: "Leyes Sociales Admin", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.01", acceptsEntries: true },

  { code: "6.1.02", name: "Gastos Generales", type: "EXPENSE", nature: "DEBIT", level: 3, parentCode: "6.1", acceptsEntries: false },
  { code: "6.1.02.001", name: "Arriendo Oficinas", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.002", name: "Servicios Basicos", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.003", name: "Comunicaciones", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.004", name: "Seguros", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.005", name: "Combustible y Peajes", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.006", name: "Mantencion y Reparaciones", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.007", name: "Gastos de Viaje y Representacion", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.008", name: "Honorarios Profesionales", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.009", name: "Depreciacion", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.010", name: "Amortizacion", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.011", name: "Gastos Notariales y Legales", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },
  { code: "6.1.02.012", name: "Gastos de Rendiciones", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.1.02", acceptsEntries: true },

  { code: "6.2", name: "Gastos Financieros", type: "EXPENSE", nature: "DEBIT", level: 2, parentCode: "6", acceptsEntries: false },
  { code: "6.2.01", name: "Costos Financieros", type: "EXPENSE", nature: "DEBIT", level: 3, parentCode: "6.2", acceptsEntries: false },
  { code: "6.2.01.001", name: "Intereses Bancarios", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
  { code: "6.2.01.002", name: "Comisiones Bancarias", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
  { code: "6.2.01.003", name: "Costo Factoring", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
  { code: "6.2.01.004", name: "Diferencia de Cambio Desfavorable", type: "EXPENSE", nature: "DEBIT", level: 4, parentCode: "6.2.01", acceptsEntries: true },
];
