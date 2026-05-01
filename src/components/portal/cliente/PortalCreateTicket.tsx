'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Loader2, Ticket, Paperclip, FileText } from 'lucide-react'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'

interface UploadedAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
}

const MAX_ATTACHMENTS = 5
const MAX_FILE_SIZE_MB = 10

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface TicketTypeOption {
  id: string
  slug: string
  name: string
  description: string | null
  defaultPriority: string
  icon: string | null
}

interface Props {
  session: ClienteSession
  selectedInstallation: string
  onCreated: () => void
  onClose: () => void
}

const PRIORITY_OPTIONS = [
  { value: 'p1', label: 'P1 — Critico', color: 'text-status-danger-fg' },
  { value: 'p2', label: 'P2 — Alto', color: 'text-status-warn-fg' },
  { value: 'p3', label: 'P3 — Normal', color: 'text-zinc-300' },
]

export function PortalCreateTicket({ session: _session, selectedInstallation, onCreated, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('p3')
  const [ticketTypeId, setTicketTypeId] = useState('')
  const [ticketTypes, setTicketTypes] = useState<TicketTypeOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = MAX_ATTACHMENTS - attachments.length
    if (remaining <= 0) {
      setError(`Máximo ${MAX_ATTACHMENTS} archivos`)
      return
    }
    const toUpload = Array.from(files).slice(0, remaining)
    for (const f of toUpload) {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`"${f.name}" excede los ${MAX_FILE_SIZE_MB}MB`)
        return
      }
    }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      for (const f of toUpload) fd.append('files', f)
      const res = await fetch('/api/portal/cliente/tickets/upload', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error al subir archivos')
      }
      setAttachments((prev) => [...prev, ...(json.data as UploadedAttachment[])])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir archivos')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  // Fetch available ticket types for client portal
  useEffect(() => {
    fetch('/api/portal/cliente/ticket-types', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) setTicketTypes(d.data)
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/portal/cliente/tickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationId: selectedInstallation,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          ...(ticketTypeId ? { ticketTypeId } : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
        }),
      })

      const json = await res.json()
      if (json.success) {
        onCreated()
        onClose()
      } else {
        setError(json.error || 'Error al crear el ticket')
      }
    } catch {
      setError('Error de conexion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/50 rounded-t-2xl sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-status-info-fg" />
            <h2 className="text-white font-semibold">Nuevo Ticket</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Ticket Type */}
          {ticketTypes.length > 0 && (
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
                Tipo de solicitud
              </label>
              <select
                value={ticketTypeId}
                onChange={(e) => {
                  setTicketTypeId(e.target.value)
                  const selected = ticketTypes.find((t) => t.id === e.target.value)
                  if (selected) setPriority(selected.defaultPriority)
                }}
                className="w-full h-10 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">Seleccionar tipo...</option>
                {ticketTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
              Titulo <span className="text-status-danger-fg">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe el problema brevemente"
              maxLength={200}
              className="w-full h-10 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
              Descripcion
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agrega mas detalles sobre el incidente o solicitud..."
              rows={4}
              maxLength={2000}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
              Prioridad
            </label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={cn(
                    'flex-1 h-9 rounded-lg border text-xs font-medium transition-all',
                    priority === opt.value
                      ? 'border-status-info-border bg-status-info-soft text-status-info-fg'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                  )}
                >
                  <span className={cn('block text-xs leading-tight', opt.color)}>
                    {opt.value.toUpperCase()}
                  </span>
                  <span className="block text-[10px] text-zinc-500 leading-tight">
                    {opt.value === 'p1' ? 'Critico' : opt.value === 'p2' ? 'Alto' : 'Normal'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
              Adjuntos <span className="text-zinc-500 font-normal">(opcional, máx {MAX_ATTACHMENTS})</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,audio/*,video/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            {attachments.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {attachments.map((a) => {
                  const isImage = a.fileType.startsWith('image/')
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5"
                    >
                      <div className="shrink-0 h-7 w-7 rounded bg-zinc-700/70 flex items-center justify-center overflow-hidden">
                        {isImage ? (
                          <img src={a.fileUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-zinc-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-200 truncate">{a.fileName}</p>
                        <p className="text-[10px] text-zinc-500">{formatBytes(a.fileSize)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="p-1 rounded hover:bg-white/10 text-zinc-400"
                        aria-label="Quitar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
              className="w-full h-9 rounded-lg border border-dashed border-zinc-700 bg-zinc-800/40 hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40 text-xs text-zinc-400 flex items-center justify-center gap-1.5 transition-colors"
            >
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…</>
              ) : (
                <><Paperclip className="h-3.5 w-3.5" /> Adjuntar foto, PDF o documento</>
              )}
            </button>
          </div>

          {error && (
            <p className="text-xs text-status-danger-fg text-center">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || uploading || !title.trim()}
              className="flex-1 h-10 rounded-lg bg-status-info hover:bg-status-info disabled:opacity-40 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
              Crear Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
