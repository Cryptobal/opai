'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Ticket, ChevronLeft, Send, Plus, MessageSquare } from 'lucide-react'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { PortalCreateTicket } from './PortalCreateTicket'
import { PreviewBadge } from './PreviewBadge'

interface TicketComment {
  id: string
  userId: string
  body: string
  isInternal: boolean
  createdAt: string
}

interface TicketItem {
  id: string
  code: string
  status: string
  priority: string
  title: string
  description?: string | null
  assignedTeam: string
  installationId?: string | null
  source: string
  slaDueAt?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  tags: string[]
  createdAt: string
  ticketType?: { name: string; slug: string } | null
  comments?: TicketComment[]
}

interface Props {
  session: ClienteSession
  selectedInstallation: string
  isProspect?: boolean
}

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'open', label: 'Abiertos' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'resolved', label: 'Resueltos' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: 'Abierto', color: 'text-blue-400 bg-blue-500/10' },
  in_progress: { label: 'En proceso', color: 'text-amber-400 bg-amber-500/10' },
  resolved: { label: 'Resuelto', color: 'text-emerald-400 bg-emerald-500/10' },
  closed: { label: 'Cerrado', color: 'text-zinc-500 bg-zinc-800' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  p1: { label: 'P1', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  p2: { label: 'P2', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  p3: { label: 'P3', color: 'text-zinc-400 bg-zinc-700/50 border-zinc-600/20' },
  p4: { label: 'P4', color: 'text-zinc-500 bg-zinc-800 border-zinc-700/20' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PortalTickets({ session, selectedInstallation, isProspect }: Props) {
  if (isProspect) {
    return (
      <div className="px-4 py-4 pb-28 max-w-lg mx-auto">
        <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Ticket className="h-5 w-5 text-blue-400" />
          Tickets de Soporte
          <PreviewBadge />
        </h2>
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5 space-y-3">
          <p className="text-sm text-zinc-300 font-medium">Sistema de tickets disponible</p>
          <ul className="space-y-2 text-xs text-zinc-400">
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Crea solicitudes y reporta incidencias</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Seguimiento en tiempo real del estado</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Comunicacion directa con el equipo Gard</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Historial completo de todas tus solicitudes</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Prioridades y SLA automaticos</li>
          </ul>
        </div>
      </div>
    )
  }

  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const authHeaders = {
    'x-contact-id': session.contactId,
    'x-tenant-id': session.tenantId,
    'x-account-id': session.accountId,
  }

  const loadTickets = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedInstallation) params.set('installationId', selectedInstallation)
    if (activeStatus) params.set('status', activeStatus)

    fetch(`/api/portal/cliente/tickets?${params.toString()}`, { headers: authHeaders })
      .then((r) => r.json())
      .then((j) => { if (j.success) setTickets(j.data) })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstallation, session, activeStatus])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  async function openTicket(ticket: TicketItem) {
    setSelectedTicket(ticket)
    setTicketLoading(true)
    try {
      const res = await fetch(`/api/portal/cliente/tickets/${ticket.id}`, { headers: authHeaders })
      const json = await res.json()
      if (json.success) setSelectedTicket(json.data)
    } finally {
      setTicketLoading(false)
    }
  }

  async function submitComment() {
    if (!selectedTicket || !newComment.trim() || submittingComment) return
    setSubmittingComment(true)
    try {
      const res = await fetch(`/api/portal/cliente/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ body: newComment.trim() }),
      })
      const json = await res.json()
      if (json.success) {
        setNewComment('')
        // Refresh ticket detail
        const refreshRes = await fetch(`/api/portal/cliente/tickets/${selectedTicket.id}`, { headers: authHeaders })
        const refreshJson = await refreshRes.json()
        if (refreshJson.success) setSelectedTicket(refreshJson.data)
      }
    } finally {
      setSubmittingComment(false)
    }
  }

  /* ── Detail view ── */
  if (selectedTicket) {
    const statusCfg = STATUS_CONFIG[selectedTicket.status] ?? STATUS_CONFIG.open
    const priorityCfg = PRIORITY_CONFIG[selectedTicket.priority] ?? PRIORITY_CONFIG.p3

    return (
      <div className="flex flex-col h-full max-w-lg mx-auto px-4 py-4 pb-24">
        {/* Back */}
        <button
          onClick={() => setSelectedTicket(null)}
          className="flex items-center gap-1.5 text-zinc-400 text-sm mb-4 hover:text-zinc-200 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a tickets
        </button>

        {/* Ticket header */}
        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', priorityCfg.color)}>
              {priorityCfg.label}
            </span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusCfg.color)}>
              {statusCfg.label}
            </span>
            <span className="text-xs text-zinc-500">{selectedTicket.code}</span>
          </div>
          <h2 className="text-white font-semibold text-base mb-1">{selectedTicket.title}</h2>
          {selectedTicket.description && (
            <p className="text-zinc-400 text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
          )}
          <p className="text-zinc-600 text-xs mt-2">{formatDate(selectedTicket.createdAt)}</p>
        </div>

        {/* Comments */}
        <div className="flex-1 space-y-3 mb-4">
          <h3 className="text-zinc-400 text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Comentarios
          </h3>

          {ticketLoading ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            </div>
          ) : (selectedTicket.comments ?? []).length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-6">Sin comentarios aun</p>
          ) : (
            (selectedTicket.comments ?? []).map((comment) => (
              <div key={comment.id} className="bg-zinc-800/40 border border-zinc-700/30 rounded-xl p-3">
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{comment.body}</p>
                <p className="text-zinc-600 text-xs mt-1.5">{formatDateTime(comment.createdAt)}</p>
              </div>
            ))
          )}
        </div>

        {/* Add comment */}
        {selectedTicket.status !== 'closed' && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escribe un comentario..."
              className="flex-1 h-10 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
            />
            <button
              onClick={submitComment}
              disabled={submittingComment || !newComment.trim()}
              className="h-10 w-10 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center transition-colors"
            >
              {submittingComment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ── List view ── */
  return (
    <div className="px-4 py-4 pb-28 max-w-lg mx-auto relative">
      {/* Header */}
      <h2 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
        <Ticket className="h-5 w-5 text-blue-400" />
        Tickets de Soporte
      </h2>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-800/50 p-1 rounded-xl overflow-x-auto">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveStatus(f.value)}
            className={cn(
              'flex-1 min-w-fit px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
              activeStatus === f.value
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-zinc-600">
          <Ticket className="h-8 w-8" />
          <p className="text-sm">Sin tickets{activeStatus ? ' en este estado' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open
            const priorityCfg = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.p3
            return (
              <button
                key={ticket.id}
                onClick={() => openTicket(ticket)}
                className="w-full text-left bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 hover:border-zinc-600/50 hover:bg-zinc-800 transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', priorityCfg.color)}>
                    {priorityCfg.label}
                  </span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusCfg.color)}>
                    {statusCfg.label}
                  </span>
                  {ticket.ticketType && (
                    <span className="text-xs text-zinc-500">{ticket.ticketType.name}</span>
                  )}
                </div>
                <p className="text-white text-sm font-medium leading-snug">{ticket.title}</p>
                <p className="text-zinc-500 text-xs mt-1.5">{formatDate(ticket.createdAt)}</p>
              </button>
            )
          })}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/40 flex items-center justify-center transition-all active:scale-95"
        aria-label="Nuevo ticket"
      >
        <Plus className="h-6 w-6 text-white" />
      </button>

      {/* Create overlay */}
      {showCreate && (
        <PortalCreateTicket
          session={session}
          selectedInstallation={selectedInstallation}
          onCreated={() => {
            loadTickets()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
