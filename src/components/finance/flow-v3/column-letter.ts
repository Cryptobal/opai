/**
 * Letras de columna estilo hoja de cálculo (base-26 biyectiva):
 * 0 → A, 25 → Z, 26 → AA, 27 → AB, 51 → AZ, 52 → BA, 701 → ZZ, 702 → AAA.
 * La columna A de la planilla es Concepto; las semanas parten en B
 * (letra = columnLetter(colIdx + 1)).
 */
export function columnLetter(index: number): string {
  if (!Number.isInteger(index) || index < 0) return "";
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
