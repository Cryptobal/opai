'use client'

import { useState } from 'react'
import { X, Loader2, Ticket } from 'lucide-react'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { cn } from '@/lib/utils'

interface Props {
  session: ClienteSession
  selectedInstallation: string
  onCreated: () => void
  onClose: () => void
}

const PRIORITY_OPTIONS = [
  { value: 'p1', label: 'P1 — Critico', color: 'text-red-400' },
  { value: 'p2', label: 'P2 — Alto', color: 'text-orange-400' },
  { value: 'p3', label: 'P3 — Normal', color: 'text-zinc-300' },
]

export function PortalCreateTicket({ session, selectedInstallation, onCreated, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('p3')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/portal/cliente/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-contact-id': session.contactId,
          'x-tenant-id': session.tenantId,
          'x-account-id': session.accountId,
        },
        body: JSON.stringify({
          installationId: selectedInstallation,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
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
            <Ticket className="h-5 w-5 text-blue-400" />
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
          {/* Title */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
              Titulo <span className="text-red-400">*</span>
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
                      ? 'border-blue-500 bg-blue-500/10 text-blue-300'
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

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
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
              disabled={submitting || !title.trim()}
              className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
