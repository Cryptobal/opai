/**
 * Mapeo por defecto entre las 16 categorías sistema del flujo de caja y los
 * códigos de cuenta del plan contable estándar Chile (ver
 * src/modules/finance/shared/constants/chart-of-accounts-cl.ts).
 *
 * El primer código de cada arreglo es la cuenta "principal" (isPrimary=true).
 * El resto son cuentas adicionales que también caen bajo esa categoría.
 *
 * Cuando el usuario hace conciliación bancaria contra una cuenta listada acá,
 * el cashflow puede asociar automáticamente el movimiento a la categoría
 * correspondiente.
 *
 * El usuario puede editar estos mappings desde la UI de configuración del
 * módulo flujo de caja. Estos defaults solo aplican al hacer seed de un
 * tenant nuevo.
 */
export const DEFAULT_CATEGORY_ACCOUNT_MAP: Record<string, string[]> = {
  // ─── Ingresos ───
  ING_VENTA_CONTRATO: ["4.1.01.001"],                           // Ingresos por Servicios de Seguridad
  ING_TURNO_EXTRA:    ["4.1.01.003"],                           // Ingresos por Horas Extra
  ING_INSTALACION:    ["4.1.01.001", "4.1.01.002"],             // Servicios + Servicios Exentos
  ING_OTRO:           ["4.2.01.001", "4.2.01.002"],             // Intereses + Dif. cambio favorable

  // ─── Egresos: remuneraciones ───
  // Sueldos cubre tanto guardias (5.1.01.001) como administrativos (6.1.01.001)
  EGR_SUELDO:         ["5.1.01.001", "6.1.01.001"],
  EGR_QUINCENA:       ["5.1.01.001", "6.1.01.001"],             // Anticipo del mismo
  EGR_PREVIRED:       ["5.1.01.002", "6.1.01.002"],             // Leyes sociales guardias + admin
  EGR_TURNO_EXTRA:    ["5.1.01.001"],                           // Pago a guardias por TE

  // ─── Egresos: administrativos ───
  EGR_TELEFONIA:      ["6.1.02.003"],                           // Comunicaciones
  EGR_ARRIENDO:       ["6.1.02.001"],                           // Arriendo Oficinas
  EGR_SERVICIOS:      ["6.1.02.002"],                           // Servicios Básicos (luz, agua, gas)
  // Proveedores varios: cubre uniformes/EPP (5.1.01.003) y honorarios profesionales (6.1.02.008).
  // El usuario puede agregar otras cuentas según sus contratos con proveedores.
  EGR_PROVEEDOR:      ["5.1.01.003", "6.1.02.008"],

  // ─── Egresos: tributarios ───
  EGR_IVA_F29:        ["2.1.02.001"],                           // IVA Débito Fiscal
  EGR_IMPUESTO:       ["2.1.02.002", "2.1.02.003", "2.1.02.004"], // Retenciones, PPM, Renta

  // ─── Egresos: socios y otros ───
  // Retiros de socios aproxima a Utilidades Retenidas (cargo cuando se distribuyen)
  EGR_RETIRO_SOCIO:   ["3.2.01.001"],
  // Otros egresos: gastos legales/notariales y rendiciones
  EGR_OTRO:           ["6.1.02.011", "6.1.02.012"],
};

/** Devuelve los códigos contables asociados a una categoría sistema. */
export function accountCodesForCategory(categoryCode: string): string[] {
  return DEFAULT_CATEGORY_ACCOUNT_MAP[categoryCode] ?? [];
}

/** Devuelve el código contable principal (primero del arreglo) o null. */
export function primaryAccountCodeForCategory(categoryCode: string): string | null {
  const codes = DEFAULT_CATEGORY_ACCOUNT_MAP[categoryCode];
  return codes && codes.length > 0 ? codes[0] : null;
}
