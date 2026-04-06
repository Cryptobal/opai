"use client"

import { Fragment, useCallback, useEffect, useRef, useState, type ReactElement } from "react"
import { ChevronRight, Loader2, Plus, Send, Sparkles, X, ArrowUp, ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { parseVisualBlocks } from "@/lib/ai/help-chat-visual-types"
import type {
  AiChatMessageV2,
  VisualBlock,
  VisualChart,
  VisualKpi,
  VisualCards,
  VisualTable,
  VisualSuggestions,
  CardAction,
  SuggestionItem,
} from "@/lib/ai/help-chat-visual-types"

type ConversationItem = {
  id: string
  title: string
  updatedAt: string
  _count?: { messages: number }
}

const MAX_VISIBLE_MESSAGES = 120

const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

const QUICK_STARTERS = [
  { label: "Resumen general del dia", icon: "sparkles", message: "Dame un resumen general del dia" },
  { label: "Pipeline comercial", icon: "chart", message: "Como va el pipeline comercial?" },
  { label: "Asistencia de hoy", icon: "users", message: "Como esta la asistencia de hoy?" },
  { label: "Tickets abiertos", icon: "ticket", message: "Cuantos tickets abiertos hay?" },
]

/* ══════════════════════════════════════════════════════════════
   Text rendering helpers
   ══════════════════════════════════════════════════════════════ */

function renderBoldText(text: string, keyPrefix: string) {
  const nodes: Array<ReactElement | string> = []
  const regex = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null = regex.exec(text)

  while (match) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    nodes.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[1]}</strong>)
    lastIndex = regex.lastIndex
    match = regex.exec(text)
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes.length ? nodes : text
}

function linkifyLine(line: string) {
  const parts: Array<ReactElement | string> = []
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null = regex.exec(line)

  while (match) {
    if (match.index > lastIndex) {
      const rendered = renderBoldText(line.slice(lastIndex, match.index), `pre-${match.index}`)
      if (Array.isArray(rendered)) parts.push(...rendered)
      else parts.push(rendered)
    }
    const label = match[1]
    const markdownHref = match[2]
    const rawHref = match[3]
    const href = markdownHref ?? rawHref
    const text = label ?? href.replace(/^https?:\/\//, "")
    if (href) {
      parts.push(
        <a key={`${match.index}-${href}`} href={href} target="_blank" rel="noreferrer noopener"
          className="underline underline-offset-2 text-cyan-300 hover:text-cyan-200">
          {text}
        </a>,
      )
    }
    lastIndex = regex.lastIndex
    match = regex.exec(line)
  }
  if (lastIndex < line.length) {
    const rendered = renderBoldText(line.slice(lastIndex), `post-${lastIndex}`)
    if (Array.isArray(rendered)) parts.push(...rendered)
    else parts.push(rendered)
  }
  return parts.length > 0 ? parts : line
}

function renderMessageContent(content: string) {
  const lines = content.split("\n")
  return lines.map((line, idx) => (
    <Fragment key={`${idx}-${line.slice(0, 12)}`}>
      {linkifyLine(line)}
      {idx < lines.length - 1 ? <br /> : null}
    </Fragment>
  ))
}

/* ══════════════════════════════════════════════════════════════
   Canvas chart components
   ══════════════════════════════════════════════════════════════ */

function MiniBarChart({ data }: { data: VisualChart["data"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const padding = { top: 24, right: 12, bottom: 32, left: 40 }
    const chartW = w - padding.left - padding.right
    const chartH = h - padding.top - padding.bottom

    const allValues = data.datasets.flatMap((d) => d.data)
    const maxVal = Math.max(...allValues, 1)

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(w - padding.right, y)
      ctx.stroke()

      ctx.fillStyle = "rgba(255,255,255,0.35)"
      ctx.font = "10px sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(String(Math.round(maxVal - (maxVal / 4) * i)), padding.left - 4, y + 3)
    }

    // Bars
    const totalBars = data.labels.length * data.datasets.length
    const groupWidth = chartW / data.labels.length
    const barWidth = Math.min(groupWidth * 0.6 / data.datasets.length, 32)
    const groupGap = (groupWidth - barWidth * data.datasets.length) / 2

    data.datasets.forEach((ds, di) => {
      const color = ds.color ?? CHART_COLORS[di % CHART_COLORS.length]
      ds.data.forEach((val, li) => {
        const barH = (val / maxVal) * chartH
        const x = padding.left + li * groupWidth + groupGap + di * barWidth
        const y = padding.top + chartH - barH
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth - 2, barH, [3, 3, 0, 0])
        ctx.fill()
      })
    })

    // X-axis labels
    ctx.fillStyle = "rgba(255,255,255,0.45)"
    ctx.font = "10px sans-serif"
    ctx.textAlign = "center"
    data.labels.forEach((label, i) => {
      const x = padding.left + i * groupWidth + groupWidth / 2
      ctx.fillText(label.length > 8 ? label.slice(0, 7) + ".." : label, x, h - padding.bottom + 14)
    })

    // Title
    if (data.title) {
      ctx.fillStyle = "rgba(255,255,255,0.7)"
      ctx.font = "bold 11px sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(data.title, padding.left, 14)
    }
  }, [data])

  return <canvas ref={canvasRef} className="w-full h-44 rounded-lg" />
}

function MiniLineChart({ data }: { data: VisualChart["data"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const padding = { top: 24, right: 12, bottom: 32, left: 40 }
    const chartW = w - padding.left - padding.right
    const chartH = h - padding.top - padding.bottom

    const allValues = data.datasets.flatMap((d) => d.data)
    const maxVal = Math.max(...allValues, 1)

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(w - padding.right, y)
      ctx.stroke()

      ctx.fillStyle = "rgba(255,255,255,0.35)"
      ctx.font = "10px sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(String(Math.round(maxVal - (maxVal / 4) * i)), padding.left - 4, y + 3)
    }

    // Lines
    const step = data.labels.length > 1 ? chartW / (data.labels.length - 1) : chartW
    data.datasets.forEach((ds, di) => {
      const color = ds.color ?? CHART_COLORS[di % CHART_COLORS.length]
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ds.data.forEach((val, i) => {
        const x = padding.left + i * step
        const y = padding.top + chartH - (val / maxVal) * chartH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // Dots
      ctx.fillStyle = color
      ds.data.forEach((val, i) => {
        const x = padding.left + i * step
        const y = padding.top + chartH - (val / maxVal) * chartH
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()
      })
    })

    // X labels
    ctx.fillStyle = "rgba(255,255,255,0.45)"
    ctx.font = "10px sans-serif"
    ctx.textAlign = "center"
    data.labels.forEach((label, i) => {
      const x = padding.left + i * step
      ctx.fillText(label.length > 8 ? label.slice(0, 7) + ".." : label, x, h - padding.bottom + 14)
    })

    if (data.title) {
      ctx.fillStyle = "rgba(255,255,255,0.7)"
      ctx.font = "bold 11px sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(data.title, padding.left, 14)
    }
  }, [data])

  return <canvas ref={canvasRef} className="w-full h-44 rounded-lg" />
}

function MiniPieChart({ data }: { data: VisualChart["data"] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const ds = data.datasets[0]
    if (!ds) return
    const total = ds.data.reduce((a, b) => a + b, 0)
    if (total === 0) return

    const cx = w * 0.35
    const cy = h / 2
    const r = Math.min(cx - 12, cy - 12)
    const isDonut = data.chartType === "donut"

    let startAngle = -Math.PI / 2
    ds.data.forEach((val, i) => {
      const sliceAngle = (val / total) * Math.PI * 2
      const color = ds.color ? ds.color : CHART_COLORS[i % CHART_COLORS.length]
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle)
      ctx.closePath()
      ctx.fill()
      startAngle += sliceAngle
    })

    if (isDonut) {
      ctx.fillStyle = "#1a1a2e"
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
      ctx.fill()
    }

    // Legend
    const legendX = w * 0.65
    ctx.font = "10px sans-serif"
    data.labels.forEach((label, i) => {
      const y = 20 + i * 18
      const color = ds.color ? ds.color : CHART_COLORS[i % CHART_COLORS.length]
      ctx.fillStyle = color
      ctx.fillRect(legendX, y - 4, 8, 8)
      ctx.fillStyle = "rgba(255,255,255,0.6)"
      ctx.textAlign = "left"
      const truncLabel = label.length > 12 ? label.slice(0, 11) + ".." : label
      ctx.fillText(`${truncLabel} (${ds.data[i]})`, legendX + 12, y + 4)
    })

    if (data.title) {
      ctx.fillStyle = "rgba(255,255,255,0.7)"
      ctx.font = "bold 11px sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(data.title, 8, 14)
    }
  }, [data])

  return <canvas ref={canvasRef} className="w-full h-44 rounded-lg" />
}

/* ══════════════════════════════════════════════════════════════
   Visual block renderers
   ══════════════════════════════════════════════════════════════ */

function ChartBlock({ block }: { block: VisualChart }) {
  const d = block.data
  if (d.chartType === "line") return <MiniLineChart data={d} />
  if (d.chartType === "pie" || d.chartType === "donut") return <MiniPieChart data={d} />
  return <MiniBarChart data={d} />
}

function KpiBlock({ block }: { block: VisualKpi }) {
  return (
    <div className="grid grid-cols-2 gap-2 my-2">
      {block.data.items.slice(0, 4).map((kpi, i) => (
        <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{kpi.label}</div>
          <div className="text-lg font-bold text-white/90">{kpi.value}</div>
          {kpi.delta && (
            <div className={cn(
              "flex items-center gap-0.5 text-xs mt-0.5",
              kpi.deltaDirection === "up" ? "text-emerald-400" :
              kpi.deltaDirection === "down" ? "text-red-400" : "text-white/40",
            )}>
              {kpi.deltaDirection === "up" && <ArrowUp className="h-3 w-3" />}
              {kpi.deltaDirection === "down" && <ArrowDown className="h-3 w-3" />}
              {kpi.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CardsBlock({ block, onAction }: { block: VisualCards; onAction: (a: CardAction) => void }) {
  return (
    <div className="space-y-1.5 my-2">
      {block.data.items.slice(0, 6).map((card, i) => (
        <button
          key={i}
          type="button"
          className={cn(
            "w-full text-left rounded-lg bg-white/[0.04] border border-white/[0.06] p-2.5 transition-colors",
            card.action && "hover:bg-white/[0.08] cursor-pointer",
          )}
          onClick={() => card.action && onAction(card.action)}
          disabled={!card.action}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white/90 truncate">{card.title}</span>
                {card.badge && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
                    card.badgeColor === "green" ? "bg-emerald-500/20 text-emerald-400" :
                    card.badgeColor === "red" ? "bg-red-500/20 text-red-400" :
                    card.badgeColor === "yellow" ? "bg-amber-500/20 text-amber-400" :
                    card.badgeColor === "blue" ? "bg-blue-500/20 text-blue-400" :
                    "bg-white/10 text-white/50",
                  )}>
                    {card.badge}
                  </span>
                )}
              </div>
              {card.subtitle && <div className="text-xs text-white/40 mt-0.5 truncate">{card.subtitle}</div>}
              {card.meta && <div className="text-[10px] text-white/30 mt-0.5">{card.meta}</div>}
            </div>
            {card.action && <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0 ml-2" />}
          </div>
        </button>
      ))}
    </div>
  )
}

function TableBlock({ block }: { block: VisualTable }) {
  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-white/[0.06]">
      {block.data.title && (
        <div className="px-2.5 py-1.5 text-xs font-medium text-white/60 bg-white/[0.03]">{block.data.title}</div>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {block.data.headers.map((h, i) => (
              <th key={i} className="px-2.5 py-1.5 text-left text-[10px] uppercase tracking-wider text-white/40 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.data.rows.slice(0, 8).map((row, ri) => (
            <tr key={ri} className="border-b border-white/[0.04] last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-1.5 text-white/70">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SuggestionsBlock({ block, onAction }: { block: VisualSuggestions; onAction: (a: CardAction) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {block.data.items.slice(0, 3).map((item, i) => (
        <button
          key={i}
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-cyan-500/15 to-emerald-500/15 border border-cyan-500/20 text-cyan-300 hover:from-cyan-500/25 hover:to-emerald-500/25 transition-colors"
          onClick={() => onAction(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function VisualBlockRenderer({ block, onAction }: { block: VisualBlock; onAction: (a: CardAction) => void }) {
  switch (block.type) {
    case "chart": return <ChartBlock block={block} />
    case "kpi": return <KpiBlock block={block} />
    case "cards": return <CardsBlock block={block} onAction={onAction} />
    case "table": return <TableBlock block={block} />
    case "suggestions": return <SuggestionsBlock block={block} onAction={onAction} />
  }
}

/* ══════════════════════════════════════════════════════════════
   Main widget component
   ══════════════════════════════════════════════════════════════ */

export function AiHelpChatWidgetV2() {
  const [open, setOpen] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [canAccess, setCanAccess] = useState(false)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [isNewConversation, setIsNewConversation] = useState(false)
  const [messages, setMessages] = useState<AiChatMessageV2[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [persistenceEnabled, setPersistenceEnabled] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /* ── Access config ── */
  useEffect(() => {
    void (async () => {
      setLoadingConfig(true)
      try {
        const res = await fetch("/api/ai/help-chat/config")
        const text = await res.text()
        let json: { success?: boolean; data?: { canAccess?: boolean } }
        try { json = text ? JSON.parse(text) : {} } catch { setCanAccess(false); return }
        if (json.success) setCanAccess(Boolean(json.data?.canAccess))
      } catch { setCanAccess(false) } finally { setLoadingConfig(false) }
    })()
  }, [])

  /* ── Load conversations ── */
  useEffect(() => {
    if (!canAccess || !open) return
    void (async () => {
      try {
        const res = await fetch("/api/ai/help-chat/conversations")
        const text = await res.text()
        let json: { success?: boolean; data?: ConversationItem[]; persistenceEnabled?: boolean }
        try { json = text ? JSON.parse(text) : {} } catch { return }
        if (json.success && Array.isArray(json.data)) {
          setConversations(json.data)
          setPersistenceEnabled(json.persistenceEnabled !== false)
          if (!activeConversationId && !isNewConversation && json.data.length > 0) {
            setActiveConversationId(json.data[0].id)
          }
        }
      } catch { /* noop */ }
    })()
  }, [canAccess, open, activeConversationId, isNewConversation])

  /* ── Load messages ── */
  useEffect(() => {
    if (!canAccess || !activeConversationId || !open) return
    void (async () => {
      setLoadingMessages(true)
      try {
        const res = await fetch(`/api/ai/help-chat/conversations/${activeConversationId}`)
        const text = await res.text()
        let json: { success?: boolean; data?: { messages?: AiChatMessageV2[] } }
        try { json = text ? JSON.parse(text) : {} } catch { setMessages([]); return }
        if (json.success && json.data?.messages) {
          setMessages((json.data.messages as AiChatMessageV2[]).slice(-MAX_VISIBLE_MESSAGES))
        } else { setMessages([]) }
      } catch { setMessages([]) } finally { setLoadingMessages(false) }
    })()
  }, [canAccess, activeConversationId, open])

  const startNewConversation = () => {
    setActiveConversationId(null)
    setIsNewConversation(true)
    setMessages([])
  }

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  /* ── Action handler ── */
  const handleAction = useCallback((action: CardAction) => {
    if (action.type === "navigate") {
      window.open(action.url, "_blank")
    } else if (action.type === "query") {
      setInput(action.message)
      // Auto-send after a tick
      setTimeout(() => {
        const btn = document.getElementById("opai-send-btn")
        if (btn) btn.click()
      }, 100)
    }
  }, [])

  /* ── Send message ── */
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return

    const optimisticUser: AiChatMessageV2 = {
      id: `tmp-user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    }
    const streamingAssistant: AiChatMessageV2 = {
      id: `tmp-streaming-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUser, streamingAssistant].slice(-MAX_VISIBLE_MESSAGES))
    setInput("")
    setSending(true)

    try {
      const res = await fetch("/api/ai/help-chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId ?? undefined,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        let errorJson: { error?: string }
        try { errorJson = errText ? JSON.parse(errText) : {} } catch { errorJson = { error: "Error de conexion" } }
        throw new Error(errorJson.error || "No se pudo enviar el mensaje")
      }

      if (!res.body) throw new Error("No se recibio respuesta del servidor")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let streamedText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        let eventType = ""
        for (const line of lines) {
          if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6)
            try {
              const data = JSON.parse(dataStr)

              if (eventType === "meta") {
                if (data.conversationId) {
                  setActiveConversationId(data.conversationId)
                  setIsNewConversation(false)
                }
                setPersistenceEnabled(data.persistenceEnabled !== false)
              } else if (eventType === "token") {
                streamedText += data.token || ""
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last && last.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
                    updated[updated.length - 1] = { ...last, content: streamedText }
                  }
                  return updated
                })
              } else if (eventType === "done") {
                const finalText = data.assistantText || streamedText
                const msgId = data.assistantMessageId || `done-${Date.now()}`
                const doneVisuals: VisualBlock[] = data.visuals ?? []
                const doneSuggestions: SuggestionItem[] = data.suggestions ?? []

                setMessages((prev) => {
                  const updated = [...prev]
                  const lastIdx = updated.findIndex(
                    (m) => m.role === "assistant" && m.id.startsWith("tmp-streaming-"),
                  )
                  if (lastIdx !== -1) {
                    updated[lastIdx] = {
                      id: msgId,
                      role: "assistant",
                      content: finalText,
                      visuals: doneVisuals.length > 0 ? doneVisuals : undefined,
                      suggestions: doneSuggestions.length > 0 ? doneSuggestions : undefined,
                      createdAt: new Date().toISOString(),
                    }
                  }
                  return updated
                })
              } else if (eventType === "error") {
                throw new Error(data.error || "Error del asistente")
              }
            } catch (parseError) {
              if (eventType === "error") throw parseError
            }
            eventType = ""
          }
        }
      }

      // Refresh conversations
      const listRes = await fetch("/api/ai/help-chat/conversations")
      const listText = await listRes.text()
      try {
        const listJson = listText ? JSON.parse(listText) : {}
        if (listJson.success && Array.isArray(listJson.data)) {
          setConversations(listJson.data)
          setPersistenceEnabled(listJson.persistenceEnabled !== false)
        }
      } catch { /* ignore */ }
    } catch (error) {
      setMessages((prev) => {
        const filtered = prev.filter(
          (m) => !(m.role === "assistant" && m.id.startsWith("tmp-streaming-") && !m.content),
        )
        return [
          ...filtered,
          {
            id: `tmp-error-${Date.now()}`,
            role: "assistant",
            content: (error as Error).message || "Ocurrio un error al responder. Intenta nuevamente.",
            createdAt: new Date().toISOString(),
          },
        ]
      })
    } finally {
      setSending(false)
    }
  }

  if (loadingConfig || !canAccess) return null

  /* ── Empty state ── */
  const emptyState = (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-emerald-400/20 flex items-center justify-center mb-4">
        <Sparkles className="h-6 w-6 text-cyan-400" />
      </div>
      <h3 className="text-base font-semibold text-white/90 mb-1">En que te ayudo?</h3>
      <p className="text-xs text-white/40 text-center mb-5">
        Puedo consultar datos, generar graficos y guiarte en el sistema.
      </p>
      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {QUICK_STARTERS.map((qs, i) => (
          <button
            key={i}
            type="button"
            className="text-left rounded-lg bg-white/[0.04] border border-white/[0.06] p-2.5 text-xs text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-colors"
            onClick={() => handleAction({ type: "query", message: qs.message })}
          >
            {qs.label}
          </button>
        ))}
      </div>
    </div>
  )

  /* ── Panel content (shared by desktop + mobile) ── */
  const panelContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 bg-gradient-to-r from-cyan-500/10 via-emerald-500/5 to-indigo-500/10">
        <div className="flex items-center gap-2 text-base font-semibold text-white/90">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          OPAI Intelligence
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-white/40 hover:bg-white/[0.08] hover:text-white/70"
          aria-label="Cerrar asistente IA"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conversation bar */}
      <div className="border-b border-white/[0.06] px-3 py-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 border-white/[0.1] text-white/60 hover:text-white/80 hover:bg-white/[0.06]" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" />
            Nueva
          </Button>
          <select
            className="h-8 flex-1 rounded-md border border-white/[0.1] bg-transparent px-2 text-xs text-white/60"
            value={activeConversationId ?? ""}
            onChange={(e) => { setActiveConversationId(e.target.value || null); setIsNewConversation(false) }}
            disabled={!persistenceEnabled}
          >
            <option value="">Conversacion nueva</option>
            {conversations.map((conv) => (
              <option key={conv.id} value={conv.id}>{conv.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loadingMessages ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
          </div>
        ) : messages.length === 0 ? (
          emptyState
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <div
                className={cn(
                  "max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "ml-auto bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 border border-cyan-500/10 text-white/90"
                    : "bg-white/[0.04] border border-white/[0.06] text-white/80",
                )}
              >
                {renderMessageContent(msg.content)}
              </div>
              {/* Visual blocks */}
              {msg.visuals && msg.visuals.length > 0 && (
                <div className="max-w-[90%] mt-1.5 space-y-1.5">
                  {msg.visuals.map((block, bi) => (
                    <VisualBlockRenderer key={bi} block={block} onAction={handleAction} />
                  ))}
                </div>
              )}
              {/* Standalone suggestions (from "done" event) */}
              {msg.suggestions && msg.suggestions.length > 0 && !msg.visuals?.some(v => v.type === "suggestions") && (
                <div className="max-w-[90%] mt-2">
                  <SuggestionsBlock
                    block={{ type: "suggestions", data: { items: msg.suggestions } }}
                    onAction={handleAction}
                  />
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="flex items-center gap-1.5 px-3 py-2">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Escribe tu pregunta..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void sendMessage() } }}
            className="bg-white/[0.04] border-white/[0.1] text-white/90 placeholder:text-white/30"
          />
          <Button
            id="opai-send-btn"
            type="button"
            size="icon"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-white shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 md:right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-cyan-400 via-emerald-400 to-indigo-500 text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition-transform hover:scale-[1.05] bottom-[calc(var(--bottom-nav-height,56px)+1rem)] lg:bottom-6"
        aria-label="Abrir OPAI Intelligence"
      >
        <Sparkles className="mx-auto h-5 w-5" />
      </button>

      {open ? (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Desktop panel */}
          <div className="hidden md:flex fixed right-6 bottom-24 z-50 h-[72vh] max-h-[720px] w-[440px] flex-col rounded-2xl border border-white/[0.06] bg-[#1a1a2e]/98 backdrop-blur-xl shadow-2xl overflow-hidden">
            {panelContent}
          </div>

          {/* Mobile full-screen */}
          <div className="md:hidden fixed inset-0 z-50 bg-[#1a1a2e] flex flex-col">
            {panelContent}
          </div>
        </>
      ) : null}
    </>
  )
}
