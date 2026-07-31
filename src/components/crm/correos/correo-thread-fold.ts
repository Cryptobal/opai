/**
 * Regla de plegado de la cadena del lector (estilo Gmail).
 *
 * Pura y sin dependencias de React: dado el orden cronológico de los mensajes
 * decide cuáles se muestran, cuáles se agrupan detrás del contador y cuáles
 * abren expandidos. La UI (`CorreoMessages`) solo consume el resultado.
 *
 * Siempre visibles: primero, penúltimo y último + no leídos + borradores +
 * el mensaje del deep-link `?mensaje=`. El resto se agrupa SOLO si son ≥ 2
 * (ocultar un único mensaje no compensa el contador).
 */

/** Contrato mínimo que necesita la regla (subconjunto de CorreoMessageDTO). */
export type FoldableMessage = {
  id: string;
  isDraft?: boolean;
};

export type FoldOptions = {
  /** Deep-link `?mensaje=`: nunca se agrupa y abre expandido. */
  forceExpandId?: string | null;
  /** Ids de mensajes sin leer (nunca se agrupan y abren expandidos). */
  unreadIds?: Iterable<string>;
};

export type FoldResult = {
  /** Índices visibles, en orden cronológico. */
  visible: number[];
  /** Índices agrupados detrás del contador (vacío si no hay plegado). */
  hidden: number[];
  /** Cantidad agrupada (= hidden.length). 0 = cadena completa. */
  hiddenCount: number;
  /**
   * Índice visible tras el cual va la píldora del contador. `null` cuando no
   * hay plegado. Los ocultos posteriores (p. ej. tramos partidos por un no
   * leído) quedan detrás de la misma píldora.
   */
  separatorAfterIndex: number | null;
  /** Índices que abren expandidos (último + no leídos + deep-link). */
  expanded: number[];
};

/** Mínimo de mensajes ocultos para que valga la pena agrupar. */
const MIN_GROUPED = 2;

export function foldThread(
  messages: FoldableMessage[],
  opts: FoldOptions = {},
): FoldResult {
  const n = messages.length;
  if (n === 0) {
    return { visible: [], hidden: [], hiddenCount: 0, separatorAfterIndex: null, expanded: [] };
  }

  const unread = new Set(opts.unreadIds ?? []);
  const forceId = opts.forceExpandId ?? null;

  const alwaysVisible = new Set<number>([0, n - 2, n - 1].filter((i) => i >= 0));
  const expanded = new Set<number>([n - 1]);

  messages.forEach((m, i) => {
    if (m.isDraft) alwaysVisible.add(i);
    if (unread.has(m.id)) {
      alwaysVisible.add(i);
      expanded.add(i);
    }
    if (forceId && m.id === forceId) {
      alwaysVisible.add(i);
      expanded.add(i);
    }
  });

  const hidden: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!alwaysVisible.has(i)) hidden.push(i);
  }

  // Con 0 o 1 oculto no se agrupa: la cadena se muestra completa.
  if (hidden.length < MIN_GROUPED) {
    return {
      visible: allIndexes(n),
      hidden: [],
      hiddenCount: 0,
      separatorAfterIndex: null,
      expanded: sorted(expanded),
    };
  }

  const visible = allIndexes(n).filter((i) => !hidden.includes(i));
  // La píldora se ancla al último visible anterior al primer oculto (índice 0
  // siempre es visible, así que existe).
  const firstHidden = hidden[0];
  let separatorAfterIndex: number | null = null;
  for (const i of visible) {
    if (i < firstHidden) separatorAfterIndex = i;
    else break;
  }

  return {
    visible,
    hidden,
    hiddenCount: hidden.length,
    separatorAfterIndex,
    expanded: sorted(expanded),
  };
}

function allIndexes(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function sorted(set: Set<number>): number[] {
  return [...set].sort((a, b) => a - b);
}

/**
 * Ids de mensajes sin leer derivados del cursor de lectura del hilo: entrantes
 * posteriores a `lastReadAt`. El DTO de mensaje no trae flag de leído — este es
 * el único dato disponible en el detalle (`thread.lastReadAt`, capturado al
 * abrir, antes del markRead).
 *
 * Sin cursor no se marca nada como no leído: un hilo nunca abierto pondría
 * TODA la cadena expandida y el plegado perdería sentido.
 */
export function unreadMessageIds(
  messages: Array<{ id: string; direction: string; sentAt: string | null; isDraft?: boolean }>,
  lastReadAt: string | null,
): string[] {
  if (!lastReadAt) return [];
  const cursor = Date.parse(lastReadAt);
  if (Number.isNaN(cursor)) return [];
  return messages
    .filter((m) => {
      if (m.isDraft || m.direction === "out" || !m.sentAt) return false;
      const sent = Date.parse(m.sentAt);
      return !Number.isNaN(sent) && sent > cursor;
    })
    .map((m) => m.id);
}
