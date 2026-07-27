/**
 * Tras sacar un hilo de la lista (archivar / papelera / posponer), el siguiente
 * a enfocar y mostrar en el lector: el de abajo, o el de arriba si era el último.
 * Estilo Gmail: la bandeja y el panel avanzan juntos sin dejar el hilo archivado.
 */
export function nextThreadAfterRemove<T extends { id: string }>(
  list: T[],
  removedId: string,
): { nextId: string | null; nextFocusIndex: number } {
  const idx = list.findIndex((t) => t.id === removedId);
  if (idx < 0) return { nextId: null, nextFocusIndex: -1 };
  const below = list[idx + 1];
  const above = list[idx - 1];
  const next = below ?? above ?? null;
  if (!next || next.id === removedId) {
    return { nextId: null, nextFocusIndex: -1 };
  }
  // Si había uno debajo, tras el splice queda en `idx`; si no, el de arriba
  // queda en `idx - 1`.
  const nextFocusIndex = below ? idx : idx - 1;
  return { nextId: next.id, nextFocusIndex };
}
