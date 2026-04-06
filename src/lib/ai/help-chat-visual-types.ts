/* ── Visual block types for OPAI Intelligence V2 ── */

export type ChartDataset = { label: string; data: number[]; color?: string }
export type VisualChart = {
  type: "chart"
  data: {
    chartType: "bar" | "line" | "pie" | "donut"
    title?: string
    labels: string[]
    datasets: ChartDataset[]
  }
}

export type KpiItem = {
  label: string
  value: string | number
  delta?: string
  deltaDirection?: "up" | "down" | "neutral"
}
export type VisualKpi = { type: "kpi"; data: { items: KpiItem[] } }

export type CardAction =
  | { type: "navigate"; url: string }
  | { type: "query"; message: string }

export type EntityCard = {
  title: string
  subtitle?: string
  badge?: string
  badgeColor?: "green" | "red" | "yellow" | "blue" | "gray"
  meta?: string
  action?: CardAction
}
export type VisualCards = { type: "cards"; data: { items: EntityCard[] } }

export type VisualTable = {
  type: "table"
  data: { title?: string; headers: string[]; rows: string[][] }
}

export type SuggestionItem = {
  label: string
  icon?: string
  action: CardAction
}
export type VisualSuggestions = {
  type: "suggestions"
  data: { items: SuggestionItem[] }
}

export type VisualBlock =
  | VisualChart
  | VisualKpi
  | VisualCards
  | VisualTable
  | VisualSuggestions

export type AiChatMessageV2 = {
  id: string
  role: "user" | "assistant"
  content: string
  visuals?: VisualBlock[]
  suggestions?: SuggestionItem[]
  createdAt: string
}

/* ── Parser: extracts :::type\n{json}\n::: blocks from assistant text ── */

const VISUAL_BLOCK_REGEX = /:::(chart|kpi|cards|table|suggestions)\n([\s\S]*?)\n:::/g

export function parseVisualBlocks(text: string): {
  cleanText: string
  visuals: VisualBlock[]
  suggestions: SuggestionItem[]
} {
  const visuals: VisualBlock[] = []
  const suggestions: SuggestionItem[] = []

  const cleanText = text.replace(VISUAL_BLOCK_REGEX, (_, blockType: string, jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr.trim())

      switch (blockType) {
        case "chart":
          visuals.push({ type: "chart", data: parsed })
          break
        case "kpi":
          visuals.push({ type: "kpi", data: { items: Array.isArray(parsed) ? parsed : parsed.items ?? [] } })
          break
        case "cards":
          visuals.push({ type: "cards", data: { items: Array.isArray(parsed) ? parsed : parsed.items ?? [] } })
          break
        case "table":
          visuals.push({ type: "table", data: parsed })
          break
        case "suggestions": {
          const items: SuggestionItem[] = Array.isArray(parsed) ? parsed : parsed.items ?? []
          suggestions.push(...items)
          visuals.push({ type: "suggestions", data: { items } })
          break
        }
      }
    } catch {
      // Invalid JSON — skip block, leave text as-is
      return ""
    }
    return ""
  })

  return {
    cleanText: cleanText.replace(/\n{3,}/g, "\n\n").trim(),
    visuals,
    suggestions,
  }
}
