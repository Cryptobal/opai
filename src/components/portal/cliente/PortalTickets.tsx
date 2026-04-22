'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Ticket, ChevronLeft, Send, Plus, MessageSquare, Clock, Paperclip, FileText, X } from 'lucide-react'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'
import { PortalCreateTicket } from './PortalCreateTicket'

interface TicketAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function slaCountdown(
  dueAt: string | null | undefined,
  status: string,
): { text: string; color: string } | null {
  if (!dueAt) return null
  if (status === 'resolved' || status === 'closed') return null
  const diff = new Date(dueAt).getTime() - Date.now()
  const hours = Math.floor(diff / (3600 * 1000))
  const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000))
  if (diff < 0) return { text: `Vencido hace ${Math.abs(hours)}h`, color: 'text-red-400' }
  if (hours < 2) return { text: `Vence en ${hours}h ${minutes}m`, color: 'text-red-400' }
  if (hours < 24) return { text: `Vence en ${hours}h`, color: 'text-amber-400' }
  return { text: `Vence en ${Math.floor(hours / 24)}d`, color: 'text-emerald-400' }
}

interface TicketComment {
  id: string
  userId: string
  body: string
  isInternal: boolean
  attachments?: TicketAttachment[] | null
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
  const installationNameMap = useMemo(
    () =>
      Object.fromEntries(
        (session?.installations ?? []).map((i) => [i.id, i.name]),
      ) as Record<string, string>,
    [session?.installations],
  )

  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [commentAttachments, setCommentAttachments] = useState<TicketAttachment[]>([])
  const [uploadingComment, setUploadingComment] = useState(false)
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const commentFileInputRef = useRef<HTMLInputElement>(null)

  const loadTickets = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedInstallation) params.set('installationId', selectedInstallation)
    if (activeStatus) params.set('status', activeStatus)

    fetch(`/api/portal/cliente/tickets?${params.toString()}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => { if (j.success) setTickets(j.data) })
      .finally(() => setLoading(false))
  }, [selectedInstallation, activeStatus])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  async function openTicket(ticket: TicketItem) {
    setSelectedTicket(ticket)
    setTicketLoading(true)
    try {
      const res = await fetch(`/api/portal/cliente/tickets/${ticket.id}`, { credentials: 'include' })
      const json = await res.json()
      if (json.success) setSelectedTicket(json.data)
    } finally {
      setTicketLoading(false)
    }
  }

  async function uploadCommentFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = 5 - commentAttachments.length
    if (remaining <= 0) return
    const toUpload = Array.from(files).slice(0, remaining)
    setUploadingComment(true)
    try {
      const fd = new FormData()
      for (const f of toUpload) fd.append('files', f)
      const res = await fetch('/api/portal/cliente/tickets/upload', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const json = await res.json()
      if (res.ok && json.success) {
        setCommentAttachments((prev) => [...prev, ...(json.data as TicketAttachment[])])
      }
    } finally {
      setUploadingComment(false)
      if (commentFileInputRef.current) commentFileInputRef.current.value = ''
    }
  }

  async function submitComment() {
    if (!selectedTicket) return
    if (submittingComment || uploadingComment) return
    const hasText = newComment.trim().length > 0
    const hasAttach = commentAttachments.length > 0
    if (!hasText && !hasAttach) return

    setSubmittingComment(true)
    try {
      const res = await fetch(`/api/portal/cliente/tickets/${selectedTicket.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: newComment.trim(),
          ...(hasAttach ? { attachments: commentAttachments } : {}),
        }),
      })
      const json = await res.json()
      if (json.success) {
        setNewComment('')
        setCommentAttachments([])
        const refreshRes = await fetch(`/api/portal/cliente/tickets/${selectedTicket.id}`, { credentials: 'include' })
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
            <p className="text-zinc-600 text-sm text-center py-6">Sin comentarios aún</p>
          ) : (
            (selectedTicket.comments ?? []).map((comment) => (
              <div key={comment.id} className="bg-zinc-800/40 border border-zinc-700/30 rounded-xl p-3">
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{comment.body}</p>
                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {comment.attachments.map((a) => {
                      const isImage = a.fileType.startsWith('image/')
                      return (
                        <a
                          key={a.id}
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-700/40 rounded-lg px-2.5 py-1.5 hover:bg-zinc-900 transition-colors"
                        >
                          <div className="shrink-0 h-9 w-9 rounded bg-zinc-700/70 flex items-center justify-center overflow-hidden">
                            {isImage ? (
                              <img src={a.fileUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <FileText className="h-4 w-4 text-zinc-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-200 truncate">{a.fileName}</p>
                            <p className="text-[10px] text-zinc-500">{formatBytes(a.fileSize)}</p>
                          </div>
                        </a>
                      )
                    })}
                  </div>
                )}
                <p className="text-zinc-600 text-xs mt-1.5">{formatDateTime(comment.createdAt)}</p>
              </div>
            ))
          )}
        </div>

        {/* Add comment */}
        {selectedTicket.status !== 'closed' && (
          <div className="space-y-2">
            {commentAttachments.length > 0 && (
              <div className="space-y-1.5">
                {commentAttachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 truncate">{a.fileName}</p>
                      <p className="text-[10px] text-zinc-500">{formatBytes(a.fileSize)}</p>
                    </div>
                    <button
                      onClick={() => setCommentAttachments((p) => p.filter((x) => x.id !== a.id))}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={commentFileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,audio/*,video/*"
              onChange={(e) => uploadCommentFiles(e.target.files)}
              className="hidden"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => commentFileInputRef.current?.click()}
                disabled={uploadingComment || commentAttachments.length >= 5}
                className="h-10 w-10 shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 flex items-center justify-center text-zinc-400"
                title="Adjuntar archivo"
                aria-label="Adjuntar archivo"
              >
                {uploadingComment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </button>
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
                disabled={
                  submittingComment ||
                  uploadingComment ||
                  (!newComment.trim() && commentAttachments.length === 0)
                }
                className="h-10 w-10 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                {submittingComment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
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
          <p className="text-sm font-medium text-zinc-400">{activeStatus ? 'Sin tickets en este estado' : 'No hay tickets abiertos'}</p>
          <p className="text-xs text-zinc-600">¿Necesitas reportar algo? Crea un ticket y nuestro equipo responderá.</p>
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
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <p className="text-zinc-500 text-xs">{formatDate(ticket.createdAt)}</p>
                  {ticket.installationId && installationNameMap[ticket.installationId] && (
                    <span className="text-xs text-zinc-500">
                      📍 {installationNameMap[ticket.installationId]}
                    </span>
                  )}
                  {(() => {
                    const sla = slaCountdown(ticket.slaDueAt, ticket.status)
                    if (!sla) return null
                    return (
                      <span className={cn('text-[10px] flex items-center gap-0.5', sla.color)}>
                        <Clock className="w-3 h-3" /> {sla.text}
                      </span>
                    )
                  })()}
                </div>
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
