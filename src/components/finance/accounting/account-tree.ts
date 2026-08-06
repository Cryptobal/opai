/**
 * Helper puro: construye un índice de árbol del plan de cuentas a partir de
 * una lista plana, tolerante a parentId inconsistente / padres ausentes.
 *
 * Resolución del padre efectivo (orden estricto):
 * 1. parentId presente y contenido en el set recibido
 * 2. Prefijo de code (quita último segmento) si ese code existe; repetir
 * 3. Raíz
 *
 * Guarda anticiclos: si se supera accounts.length o se revisita un id,
 * el nodo se trata como raíz.
 */

export interface AccountNodeInput {
  id: string;
  code: string;
  parentId: string | null;
  level: number;
}

export interface AccountTreeIndex {
  /** ids de raíces efectivas, ordenadas. */
  roots: string[];
  /** id → ids de hijos directos, ordenados. */
  childrenOf: Map<string, string[]>;
  /** id → id del padre efectivo (null si raíz). */
  parentOf: Map<string, string | null>;
  /** id → profundidad visual, 0-based. */
  depthOf: Map<string, number>;
}

export interface FlatRow<T> {
  account: T;
  depth: number;
  childCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

function compareCode(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

function parentCodeCandidates(code: string): string[] {
  const segs = code.split(".");
  const out: string[] = [];
  for (let i = segs.length - 1; i >= 1; i--) {
    out.push(segs.slice(0, i).join("."));
  }
  return out;
}

/**
 * Resuelve el padre efectivo de un nodo dentro del set recibido.
 * Retorna null si es raíz (o si el único padre candidato formaría un ciclo
 * que se detecta más adelante).
 */
function resolveParentId(
  node: AccountNodeInput,
  byId: Map<string, AccountNodeInput>,
  byCode: Map<string, AccountNodeInput>,
): string | null {
  if (node.parentId && byId.has(node.parentId) && node.parentId !== node.id) {
    return node.parentId;
  }
  for (const candidate of parentCodeCandidates(node.code)) {
    const parent = byCode.get(candidate);
    if (parent && parent.id !== node.id) {
      return parent.id;
    }
  }
  return null;
}

/**
 * Rompe ciclos en parentOf: si al subir desde un nodo se revisita un id
 * (o se supera maxDepth), todos los miembros del ciclo quedan como raíz.
 */
function breakParentCycles(
  accounts: readonly AccountNodeInput[],
  parentOf: Map<string, string | null>,
): void {
  const maxDepth = Math.max(accounts.length, 1);
  for (const a of accounts) {
    const path: string[] = [];
    const seen = new Map<string, number>();
    let cur: string | null = a.id;
    let steps = 0;
    while (cur) {
      if (seen.has(cur)) {
        const start = seen.get(cur)!;
        for (let i = start; i < path.length; i++) {
          parentOf.set(path[i]!, null);
        }
        break;
      }
      seen.set(cur, path.length);
      path.push(cur);
      steps++;
      if (steps > maxDepth) {
        parentOf.set(a.id, null);
        break;
      }
      cur = parentOf.get(cur) ?? null;
    }
  }
}

export function buildAccountTree(
  accounts: readonly AccountNodeInput[],
): AccountTreeIndex {
  const byId = new Map<string, AccountNodeInput>();
  const byCode = new Map<string, AccountNodeInput>();
  for (const a of accounts) {
    byId.set(a.id, a);
    byCode.set(a.code, a);
  }

  const parentOf = new Map<string, string | null>();

  // Primera pasada: resolver padres (aún sin anticiclo cruzado).
  for (const a of accounts) {
    parentOf.set(a.id, resolveParentId(a, byId, byCode));
  }

  // Segunda pasada: romper ciclos (todos los miembros → raíz).
  breakParentCycles(accounts, parentOf);

  const childrenOf = new Map<string, string[]>();
  for (const a of accounts) {
    childrenOf.set(a.id, []);
  }

  const roots: string[] = [];
  for (const a of accounts) {
    const p = parentOf.get(a.id) ?? null;
    if (p && childrenOf.has(p)) {
      childrenOf.get(p)!.push(a.id);
    } else {
      parentOf.set(a.id, null);
      roots.push(a.id);
    }
  }

  // Ordenar hermanos y raíces por code numérico.
  const sortByCode = (ids: string[]) =>
    ids.sort((x, y) =>
      compareCode(byId.get(x)!.code, byId.get(y)!.code),
    );

  sortByCode(roots);
  for (const kids of childrenOf.values()) {
    sortByCode(kids);
  }

  // depthOf por walk desde raíces (anticiclo por si acaso).
  const depthOf = new Map<string, number>();
  const stack: Array<{ id: string; depth: number }> = roots.map((id) => ({
    id,
    depth: 0,
  }));
  const visited = new Set<string>();
  while (stack.length > 0) {
    const { id, depth } = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    depthOf.set(id, depth);
    const kids = childrenOf.get(id) ?? [];
    // push en reverse para preservar orden al hacer pop (DFS); el depth
    // no depende del orden de visita entre hermanos.
    for (let i = kids.length - 1; i >= 0; i--) {
      const kid = kids[i]!;
      if (!visited.has(kid)) {
        stack.push({ id: kid, depth: depth + 1 });
      }
    }
  }
  // Nodos no alcanzados (no debería ocurrir) → raíz depth 0.
  for (const a of accounts) {
    if (!depthOf.has(a.id)) {
      depthOf.set(a.id, 0);
      if (!roots.includes(a.id)) roots.push(a.id);
    }
  }

  return { roots, childrenOf, parentOf, depthOf };
}

export function ancestorsOf(id: string, index: AccountTreeIndex): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = index.parentOf.get(id) ?? null;
  let steps = 0;
  const max = Math.max(index.parentOf.size, 1);
  while (cur) {
    if (seen.has(cur) || steps > max) break;
    seen.add(cur);
    out.push(cur);
    cur = index.parentOf.get(cur) ?? null;
    steps++;
  }
  return out;
}

export function flattenVisible<T extends AccountNodeInput>(
  accounts: readonly T[],
  index: AccountTreeIndex,
  opts: {
    expanded: ReadonlySet<string>;
    /** ids forzados a expandirse (modo búsqueda). */
    forceExpanded?: ReadonlySet<string>;
    /** si viene, sólo se emiten ids contenidos aquí (modo búsqueda). */
    restrictTo?: ReadonlySet<string> | null;
  },
): FlatRow<T>[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const force = opts.forceExpanded ?? new Set<string>();
  const restrict = opts.restrictTo ?? null;

  const result: FlatRow<T>[] = [];

  const walk = (ids: string[]) => {
    for (const id of ids) {
      if (restrict && !restrict.has(id)) continue;
      const account = byId.get(id);
      if (!account) continue;

      const allChildren = index.childrenOf.get(id) ?? [];
      // En modo búsqueda, el childCount visible es el de hijos en restrictTo;
      // el chevron refleja si hay hijos en el árbol completo (para poder
      // expandir manualmente tras matchear sólo el padre).
      const childCount = allChildren.length;
      const hasChildren = childCount > 0;
      const isExpanded =
        hasChildren && (opts.expanded.has(id) || force.has(id));
      const depth = index.depthOf.get(id) ?? 0;

      result.push({
        account,
        depth,
        childCount,
        hasChildren,
        isExpanded,
      });

      if (isExpanded) {
        walk(allChildren);
      }
    }
  };

  walk(index.roots);
  return result;
}
