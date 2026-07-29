/** Tokens de búsqueda reutilizables (chips removibles, operadores). */

export type SearchTokenChip = {
  key: string;
  label: string;
  /** Token a quitar de la query (operador o término). */
  token: string;
};

/** Reconstruye chips a partir del query crudo (operadores + términos libres). */
export function chipsFromQuery(query: string): SearchTokenChip[] {
  const chips: SearchTokenChip[] = [];
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(query))) {
    const token = match[0];
    chips.push({ key: `${i}-${token}`, label: token, token });
    i += 1;
  }
  return chips;
}

/** Quita la primera ocurrencia del token (respeta frases entre comillas). */
export function removeChipFromQuery(query: string, token: string): string {
  const re = /(?:[^\s"]+|"[^"]*")+/g;
  const parts: string[] = [];
  let removed = false;
  let match: RegExpExecArray | null;
  while ((match = re.exec(query))) {
    if (!removed && match[0] === token) {
      removed = true;
      continue;
    }
    parts.push(match[0]);
  }
  return parts.join(" ").trim();
}
