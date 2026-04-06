/**
 * Tipos y parser para bloques visuales del asistente (OPAI Intelligence V2).
 * Formato: :::type\nJSON\n:::
 */

export type ChartType = "bar" | "line" | "pie" | "donut";

export type VisualDataset = {
  label: string;
  data: number[];
  color?: string;
};

export type VisualChart = {
  kind: "chart";
  chartType: ChartType;
  title?: string;
  labels: string[];
  datasets: VisualDataset[];
};

export type VisualKpiItem = {
  label: string;
  value: string | number;
  delta?: string;
  deltaDirection?: "up" | "down" | "neutral";
};

export type VisualKpi = {
  kind: "kpi";
  items: VisualKpiItem[];
};

export type CardAction =
  | { type: "navigate"; url: string }
  | { type: "query"; message: string };

export type VisualCardItem = {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  meta?: string;
  action?: CardAction;
};

export type VisualCards = {
  kind: "cards";
  items: VisualCardItem[];
};

export type VisualTable = {
  kind: "table";
  title?: string;
  headers: string[];
  rows: string[][];
};

export type SuggestionIcon = "chart" | "users" | "calendar" | "sparkles" | "link";

export type VisualSuggestionItem = {
  label: string;
  icon?: SuggestionIcon;
  action: CardAction;
};

export type VisualSuggestions = {
  kind: "suggestions";
  items: VisualSuggestionItem[];
};

export type VisualBlock =
  | VisualChart
  | VisualKpi
  | VisualCards
  | VisualTable
  | VisualSuggestions;

export type AiChatMessageV2 = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  visuals?: VisualBlock[];
  suggestions?: VisualSuggestionItem[];
};

const BLOCK_RE =
  /:::(chart|kpi|cards|table|suggestions)\s*\n([\s\S]*?)\n:::/gi;

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw.trim()) as T;
  } catch {
    return null;
  }
}

function parseChartPayload(raw: string): VisualChart | null {
  const o = safeParseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object") return null;
  const chartType = o.chartType as ChartType;
  if (!["bar", "line", "pie", "donut"].includes(chartType)) return null;
  const labels = Array.isArray(o.labels) ? (o.labels as unknown[]).map(String) : [];
  const datasetsRaw = Array.isArray(o.datasets) ? o.datasets : [];
  const datasets: VisualDataset[] = datasetsRaw.map((d) => {
    const x = d as Record<string, unknown>;
    return {
      label: String(x.label ?? ""),
      data: Array.isArray(x.data) ? (x.data as unknown[]).map((n) => Number(n) || 0) : [],
      color: typeof x.color === "string" ? x.color : undefined,
    };
  });
  if (labels.length < 1 || datasets.length < 1) return null;
  return {
    kind: "chart",
    chartType,
    title: typeof o.title === "string" ? o.title : undefined,
    labels,
    datasets,
  };
}

function parseKpiPayload(raw: string): VisualKpi | null {
  const arr = safeParseJson<unknown>(raw);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items: VisualKpiItem[] = arr.map((row) => {
    const x = row as Record<string, unknown>;
    return {
      label: String(x.label ?? ""),
      value: typeof x.value === "number" ? x.value : String(x.value ?? ""),
      delta: typeof x.delta === "string" ? x.delta : undefined,
      deltaDirection:
        x.deltaDirection === "up" || x.deltaDirection === "down" || x.deltaDirection === "neutral"
          ? x.deltaDirection
          : undefined,
    };
  });
  return { kind: "kpi", items };
}

function parseCardsPayload(raw: string): VisualCards | null {
  const arr = safeParseJson<unknown>(raw);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items: VisualCardItem[] = arr.map((row) => {
    const x = row as Record<string, unknown>;
    let action: CardAction | undefined;
    const a = x.action as Record<string, unknown> | undefined;
    if (a && a.type === "navigate" && typeof a.url === "string") {
      action = { type: "navigate", url: a.url };
    } else if (a && a.type === "query" && typeof a.message === "string") {
      action = { type: "query", message: a.message };
    }
    return {
      title: String(x.title ?? ""),
      subtitle: typeof x.subtitle === "string" ? x.subtitle : undefined,
      badge: typeof x.badge === "string" ? x.badge : undefined,
      badgeColor: typeof x.badgeColor === "string" ? x.badgeColor : undefined,
      meta: typeof x.meta === "string" ? x.meta : undefined,
      action,
    };
  });
  return { kind: "cards", items };
}

function parseTablePayload(raw: string): VisualTable | null {
  const o = safeParseJson<Record<string, unknown>>(raw);
  if (!o || typeof o !== "object") return null;
  const headers = Array.isArray(o.headers) ? (o.headers as unknown[]).map(String) : [];
  const rowsRaw = Array.isArray(o.rows) ? o.rows : [];
  const rows: string[][] = rowsRaw.map((r) =>
    Array.isArray(r) ? (r as unknown[]).map(String) : [],
  );
  if (headers.length === 0) return null;
  return {
    kind: "table",
    title: typeof o.title === "string" ? o.title : undefined,
    headers,
    rows,
  };
}

const SUGGESTION_ICONS = new Set<SuggestionIcon>(["chart", "users", "calendar", "sparkles", "link"]);

function parseSuggestionsPayload(raw: string): VisualSuggestions | null {
  const arr = safeParseJson<unknown>(raw);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items: VisualSuggestionItem[] = [];
  for (const row of arr) {
    const x = row as Record<string, unknown>;
    const a = x.action as Record<string, unknown> | undefined;
    let action: CardAction | undefined;
    if (a?.type === "navigate" && typeof a.url === "string") {
      action = { type: "navigate", url: a.url };
    } else if (a?.type === "query" && typeof a.message === "string") {
      action = { type: "query", message: a.message };
    }
    if (!action) continue;
    const icon = typeof x.icon === "string" && SUGGESTION_ICONS.has(x.icon as SuggestionIcon) ? (x.icon as SuggestionIcon) : undefined;
    items.push({
      label: String(x.label ?? ""),
      icon,
      action,
    });
  }
  if (items.length === 0) return null;
  return { kind: "suggestions", items };
}

export function parseVisualBlocks(text: string): {
  cleanText: string;
  visuals: VisualBlock[];
  suggestions: VisualSuggestionItem[];
} {
  const visuals: VisualBlock[] = [];
  const suggestions: VisualSuggestionItem[] = [];
  let cleanText = text;

  cleanText = cleanText.replace(BLOCK_RE, (full, type: string, body: string) => {
    const t = type.toLowerCase();
    let block: VisualBlock | null = null;
    if (t === "chart") block = parseChartPayload(body);
    else if (t === "kpi") block = parseKpiPayload(body);
    else if (t === "cards") block = parseCardsPayload(body);
    else if (t === "table") block = parseTablePayload(body);
    else if (t === "suggestions") {
      const s = parseSuggestionsPayload(body);
      if (s) {
        suggestions.push(...s.items);
        block = s;
      }
    }
    if (block && block.kind !== "suggestions") {
      visuals.push(block);
    }
    return "";
  });

  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanText, visuals, suggestions };
}
