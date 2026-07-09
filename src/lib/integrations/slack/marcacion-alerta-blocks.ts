/**
 * Tarjeta Block Kit de ALERTA para una marca fuera de rango (control de
 * asistencia). Se publica al canal Slack de la instalación con la foto de
 * evidencia embebida — visibilidad social intencional (decisión de producto).
 *
 * Slack no da color por bloque: la urgencia va por emoji/prefijo, igual que el
 * estándar de `home-adjudicados-blocks.ts`.
 */

const CHILE_TZ = "America/Santiago";

export interface MarcacionFueraRangoInput {
  guardiaName: string;
  guardiaRut: string;
  /** "entrada" | "salida" (o el `tipo` crudo del endpoint). */
  tipo: string;
  installationName: string;
  timestamp: Date;
  geoDistanciaM: number | null;
  geoRadiusM: number;
  lat: number | null;
  lng: number | null;
  fotoEvidenciaUrl?: string | null;
  /** URL absoluta a la vista de marcaciones. */
  detailUrl: string;
  deviceDisplay?: string | null;
}

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 150), emoji: true });

function tipoLabel(tipo: string): string {
  if (tipo === "entrada" || tipo === "in") return "entrada";
  if (tipo === "salida" || tipo === "out") return "salida";
  return tipo;
}

function horaChile(d: Date): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: CHILE_TZ,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function factorFuera(distanciaM: number | null, radioM: number): string {
  if (distanciaM == null || radioM <= 0) return "—";
  const factor = distanciaM / radioM;
  return `${factor.toFixed(1)}× fuera`;
}

/** Construye `{ text, blocks }` de la alerta de marca fuera de rango. */
export function buildMarcacionFueraRangoBlocks(input: MarcacionFueraRangoInput): {
  text: string;
  blocks: unknown[];
} {
  const tipo = tipoLabel(input.tipo);
  const distancia = input.geoDistanciaM != null ? `${input.geoDistanciaM} m` : "sin dato";
  const headerText = `🚨 Marca fuera de rango · ${tipo}`;

  const fields: Array<{ label: string; value: string }> = [
    { label: "Guardia", value: `${input.guardiaName}\n${input.guardiaRut}` },
    { label: "Instalación", value: input.installationName },
    { label: "Hora servidor", value: horaChile(input.timestamp) },
    { label: "Distancia", value: `📍 *${distancia}*` },
    { label: "Radio permitido", value: `${input.geoRadiusM} m` },
    { label: "Desvío", value: factorFuera(input.geoDistanciaM, input.geoRadiusM) },
  ];

  const blocks: unknown[] = [
    { type: "header", text: pt(headerText) },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${input.guardiaName}* registró su *${tipo}* fuera del radio permitido de *${input.installationName}*.`,
      },
    },
    {
      type: "section",
      fields: fields.map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })),
    },
  ];

  if (input.fotoEvidenciaUrl) {
    blocks.push({
      type: "image",
      image_url: input.fotoEvidenciaUrl,
      alt_text: `Evidencia de marca de ${input.guardiaName}`,
    });
  }

  const geoBits: string[] = [];
  if (input.lat != null && input.lng != null) {
    geoBits.push(`🌐 ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}`);
  }
  if (input.deviceDisplay) geoBits.push(input.deviceDisplay);
  geoBits.push(`🕒 ${horaChile(input.timestamp)} · Operaciones - Marcación · OPAI`);
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: geoBits.join("  ·  ") }],
  });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: "marcacion_ver_detalle",
        text: pt("Ver detalle"),
        url: input.detailUrl,
        style: "primary",
      },
    ],
  });

  // Ping al canal completo: sin <!channel> la tarjeta se publica pero muchos
  // miembros no reciben push (solo ven el mensaje al abrir el canal).
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "<!channel> Marca fuera de rango — requiere revisión de central.",
      },
    ],
  });

  const text = `<!channel> 🚨 Marca fuera de rango · ${input.guardiaName} · ${tipo} · ${distancia} (radio ${input.geoRadiusM} m) · ${input.installationName}`;
  return { text, blocks };
}
