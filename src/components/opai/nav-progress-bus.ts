type Listener = () => void;

const listeners = new Set<Listener>();

/** Dispara la barra de progreso de navegación (clics / router.push). */
export function startNavProgress() {
  for (const listener of listeners) listener();
}

export function subscribeNavProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
