// @ds-allow-legacy carrier brand colors (Movistar/Entel/WOM/Claro corporate identity, not state semantics)
/**
 * CARRIER_COLORS — paleta de identidad visual de los operadores telefónicos
 * chilenos. Se usa exclusivamente para badges/pills que identifican a qué
 * carrier pertenece una línea telefónica. Esto es información de marca de
 * terceros (no estado), por eso se exenta de los tokens semánticos del DS.
 *
 * Movistar = verde · Entel = rojo · WOM = púrpura · Claro = rojo oscuro.
 *
 * Si se agrega un carrier nuevo, mantener la lógica:
 *   bg-{color}-500/15 + text-{color}-700 + dark:text-{color}-400
 *
 * Cualquier otro uso de colores por marca debe seguir este mismo patrón
 * (constante centralizada + comentario @ds-allow-legacy).
 */
export const CARRIER_COLORS: Record<string, string> = {
  movistar: "bg-green-500/15 text-green-700 dark:text-green-400",
  entel:    "bg-red-500/15 text-red-700 dark:text-red-400",
  wom:      "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  claro:    "bg-red-600/15 text-red-800 dark:text-red-300",
  otro:     "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400",
};

export const CARRIERS = ["movistar", "entel", "wom", "claro", "otro"] as const;
export type Carrier = (typeof CARRIERS)[number];
