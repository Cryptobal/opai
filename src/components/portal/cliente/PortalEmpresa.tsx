'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Building2, Users, FileText, Contact, MapPin,
  Plus, Trash2, Save, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente-types'

/* ── Types ── */

interface Representante {
  id: string
  nombre: string
  rut: string
  email: string | null
}

interface Personeria {
  id: string
  fechaEscritura: string | null
  tipoEscritura: string | null
  notaria: string | null
}

interface ContactData {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  roleTitle: string | null
  isPrimary: boolean
}

interface InstallationData {
  id: string
  name: string
  address: string | null
  commune: string | null
}

interface EmpresaData {
  id: string
  name: string
  legalName: string | null
  rut: string | null
  address: string | null
  commune: string | null
  representantesLegales: Representante[]
  personeria: Personeria | null
  contacts: ContactData[]
  installations: InstallationData[]
}

/* ── Styled card wrapper ── */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] p-4',
        className
      )}
      style={{ background: 'linear-gradient(145deg, #1E293B, #1A2332)' }}
    >
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-teal-400" />
      <h3 className="text-sm font-semibold text-white">{title}</h3>
    </div>
  )
}

function SaveButton({
  saving,
  saved,
  onClick,
  disabled,
}: {
  saving: boolean
  saved: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
        saved
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white',
        (saving || disabled) && 'opacity-50 cursor-not-allowed'
      )}
    >
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : saved ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Save className="h-3 w-3" />
      )}
      {saved ? 'Guardado' : 'Guardar'}
    </button>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 transition-colors"
      />
    </div>
  )
}

/* ── Main Component ── */

export function PortalEmpresa({ session }: { session: ClienteSession }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<EmpresaData | null>(null)
  const [error, setError] = useState('')

  // Section-level form states
  const [legalName, setLegalName] = useState('')
  const [rut, setRut] = useState('')
  const [address, setAddress] = useState('')
  const [commune, setCommune] = useState('')
  const [savingDatos, setSavingDatos] = useState(false)
  const [savedDatos, setSavedDatos] = useState(false)

  // Representantes
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [newRepNombre, setNewRepNombre] = useState('')
  const [newRepRut, setNewRepRut] = useState('')
  const [newRepEmail, setNewRepEmail] = useState('')
  const [addingRep, setAddingRep] = useState(false)
  const [deletingRepId, setDeletingRepId] = useState<string | null>(null)
  const [savingRepId, setSavingRepId] = useState<string | null>(null)
  const [savedRepId, setSavedRepId] = useState<string | null>(null)

  // Personeria
  const [fechaEscritura, setFechaEscritura] = useState('')
  const [tipoEscritura, setTipoEscritura] = useState('')
  const [notaria, setNotaria] = useState('')
  const [savingPersoneria, setSavingPersoneria] = useState(false)
  const [savedPersoneria, setSavedPersoneria] = useState(false)

  // Contacts
  const [contacts, setContacts] = useState<ContactData[]>([])
  const [savingContactId, setSavingContactId] = useState<string | null>(null)
  const [savedContactId, setSavedContactId] = useState<string | null>(null)

  // Installations
  const [installations, setInstallations] = useState<InstallationData[]>([])
  const [savingInstId, setSavingInstId] = useState<string | null>(null)
  const [savedInstId, setSavedInstId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/cliente/empresa')
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const d = json.data as EmpresaData
      setData(d)
      setLegalName(d.legalName ?? '')
      setRut(d.rut ?? '')
      setAddress(d.address ?? '')
      setCommune(d.commune ?? '')
      setRepresentantes(d.representantesLegales)
      if (d.personeria) {
        setFechaEscritura(d.personeria.fechaEscritura ? d.personeria.fechaEscritura.split('T')[0] : '')
        setTipoEscritura(d.personeria.tipoEscritura ?? '')
        setNotaria(d.personeria.notaria ?? '')
      }
      setContacts(d.contacts)
      setInstallations(d.installations)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Helpers for timed "saved" feedback
  function flashSaved(setter: (v: boolean) => void) {
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  /* ── Save handlers ── */

  async function saveDatos() {
    setSavingDatos(true)
    try {
      const res = await fetch('/api/portal/cliente/empresa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName, rut, address, commune }),
      })
      const json = await res.json()
      if (json.success) flashSaved(setSavedDatos)
    } finally {
      setSavingDatos(false)
    }
  }

  async function addRepresentante() {
    if (!newRepNombre.trim() || !newRepRut.trim()) return
    setAddingRep(true)
    try {
      const res = await fetch('/api/portal/cliente/empresa/representantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: newRepNombre, rut: newRepRut, email: newRepEmail || null }),
      })
      const json = await res.json()
      if (json.success) {
        setRepresentantes((prev) => [...prev, json.data])
        setNewRepNombre('')
        setNewRepRut('')
        setNewRepEmail('')
      }
    } finally {
      setAddingRep(false)
    }
  }

  async function updateRepresentanteEmail(id: string, email: string) {
    setSavingRepId(id)
    try {
      const res = await fetch('/api/portal/cliente/empresa/representantes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: email || null }),
      })
      const json = await res.json()
      if (json.success) {
        setSavedRepId(id)
        setTimeout(() => setSavedRepId(null), 2000)
      }
    } finally {
      setSavingRepId(null)
    }
  }

  async function deleteRepresentante(id: string) {
    setDeletingRepId(id)
    try {
      const res = await fetch(`/api/portal/cliente/empresa/representantes?id=${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (json.success) {
        setRepresentantes((prev) => prev.filter((r) => r.id !== id))
      }
    } finally {
      setDeletingRepId(null)
    }
  }

  async function savePersoneria() {
    setSavingPersoneria(true)
    try {
      const res = await fetch('/api/portal/cliente/empresa/personeria', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaEscritura: fechaEscritura || null, tipoEscritura, notaria }),
      })
      const json = await res.json()
      if (json.success) flashSaved(setSavedPersoneria)
    } finally {
      setSavingPersoneria(false)
    }
  }

  async function saveContact(contact: ContactData) {
    setSavingContactId(contact.id)
    try {
      const res = await fetch('/api/portal/cliente/empresa/contactos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          roleTitle: contact.roleTitle,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSavedContactId(contact.id)
        setTimeout(() => setSavedContactId(null), 2000)
      }
    } finally {
      setSavingContactId(null)
    }
  }

  async function saveInstallation(inst: InstallationData) {
    setSavingInstId(inst.id)
    try {
      const res = await fetch('/api/portal/cliente/empresa/instalaciones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inst.id, name: inst.name, address: inst.address, commune: inst.commune }),
      })
      const json = await res.json()
      if (json.success) {
        setSavedInstId(inst.id)
        setTimeout(() => setSavedInstId(null), 2000)
      }
    } finally {
      setSavingInstId(null)
    }
  }

  function updateContact(id: string, field: keyof ContactData, value: string) {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  function updateInstallation(id: string, field: keyof InstallationData, value: string) {
    setInstallations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    )
  }

  /* ── Loading & Error states ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
        {error || 'Sin datos'}
      </div>
    )
  }

  /* ── Render ── */

  return (
    <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-4 pb-24 space-y-4">
      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-teal-400" />
          Datos de tu empresa
        </h2>
        <p className="text-xs text-zinc-500 mt-1">Información comercial y de contacto</p>
      </div>

      {/* ── 1. Datos de la empresa ── */}
      <Card>
        <SectionHeader icon={Building2} title="Datos de la empresa" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputField label="Razón social" value={legalName} onChange={setLegalName} placeholder="Razón social" />
          <InputField label="RUT" value={rut} onChange={setRut} placeholder="12.345.678-9" />
          <InputField label="Dirección" value={address} onChange={setAddress} placeholder="Dirección" />
          <InputField label="Comuna" value={commune} onChange={setCommune} placeholder="Comuna" />
        </div>
        <div className="flex justify-end mt-3">
          <SaveButton saving={savingDatos} saved={savedDatos} onClick={saveDatos} />
        </div>
      </Card>

      {/* ── 2. Representantes legales ── */}
      <Card>
        <SectionHeader icon={Users} title="Representantes legales" />

        {representantes.length === 0 && (
          <p className="text-xs text-zinc-500 mb-3">Sin representantes legales registrados.</p>
        )}

        <p className="text-[11px] text-amber-400/70 mb-3">
          El email de cada representante legal es obligatorio para el flujo de firma de contrato.
        </p>

        <div className="space-y-2 mb-3">
          {representantes.map((rep) => (
            <div
              key={rep.id}
              className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{rep.nombre}</p>
                  <p className="text-xs text-zinc-400">{rep.rut}</p>
                </div>
                <button
                  onClick={() => deleteRepresentante(rep.id)}
                  disabled={deletingRepId === rep.id}
                  className="text-zinc-500 hover:text-red-400 transition-colors p-1 shrink-0"
                >
                  {deletingRepId === rep.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  value={rep.email ?? ''}
                  onChange={(e) =>
                    setRepresentantes((prev) =>
                      prev.map((r) => (r.id === rep.id ? { ...r, email: e.target.value } : r))
                    )
                  }
                  placeholder="Email de firma (requerido)"
                  className={cn(
                    'flex-1 h-8 rounded-lg border bg-zinc-900 px-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 transition-colors',
                    !rep.email ? 'border-amber-500/50' : 'border-zinc-700'
                  )}
                />
                <SaveButton
                  saving={savingRepId === rep.id}
                  saved={savedRepId === rep.id}
                  onClick={() => updateRepresentanteEmail(rep.id, rep.email ?? '')}
                  disabled={!rep.email?.trim()}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newRepNombre}
              onChange={(e) => setNewRepNombre(e.target.value)}
              placeholder="Nombre"
              className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 transition-colors"
            />
            <input
              type="text"
              value={newRepRut}
              onChange={(e) => setNewRepRut(e.target.value)}
              placeholder="RUT"
              className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 transition-colors"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={newRepEmail}
              onChange={(e) => setNewRepEmail(e.target.value)}
              placeholder="Email de firma"
              className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 transition-colors"
            />
            <button
              onClick={addRepresentante}
              disabled={addingRep || !newRepNombre.trim() || !newRepRut.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {addingRep ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Agregar
            </button>
          </div>
        </div>
      </Card>

      {/* ── 3. Personeria ── */}
      <Card>
        <SectionHeader icon={FileText} title="Personería" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InputField
            label="Fecha escritura"
            type="date"
            value={fechaEscritura}
            onChange={setFechaEscritura}
          />
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Tipo escritura</label>
            <select
              value={tipoEscritura}
              onChange={(e) => setTipoEscritura(e.target.value)}
              className="w-full h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:border-teal-400 transition-colors appearance-none"
            >
              <option value="">Seleccionar...</option>
              <option value="Escritura pública">Escritura pública</option>
              <option value="Sociedad">Sociedad</option>
              <option value="Empresa en un día">Empresa en un día</option>
            </select>
          </div>
          <InputField label="Notaría" value={notaria} onChange={setNotaria} placeholder="Nombre de la notaría" />
        </div>
        <div className="flex justify-end mt-3">
          <SaveButton saving={savingPersoneria} saved={savedPersoneria} onClick={savePersoneria} />
        </div>
      </Card>

      {/* ── 4. Contactos ── */}
      <Card>
        <SectionHeader icon={Contact} title="Contactos" />
        {contacts.length === 0 && (
          <p className="text-xs text-zinc-500">Sin contactos registrados.</p>
        )}
        <div className="space-y-3">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-3 space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <InputField
                  label="Nombre"
                  value={c.firstName}
                  onChange={(v) => updateContact(c.id, 'firstName', v)}
                />
                <InputField
                  label="Apellido"
                  value={c.lastName}
                  onChange={(v) => updateContact(c.id, 'lastName', v)}
                />
                <InputField
                  label="Email"
                  value={c.email ?? ''}
                  onChange={(v) => updateContact(c.id, 'email', v)}
                />
                <InputField
                  label="Cargo"
                  value={c.roleTitle ?? ''}
                  onChange={(v) => updateContact(c.id, 'roleTitle', v)}
                />
              </div>
              <div className="flex justify-end">
                <SaveButton
                  saving={savingContactId === c.id}
                  saved={savedContactId === c.id}
                  onClick={() => saveContact(c)}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 5. Instalaciones ── */}
      <Card>
        <SectionHeader icon={MapPin} title="Instalaciones" />
        {installations.length === 0 && (
          <p className="text-xs text-zinc-500">Sin instalaciones activas.</p>
        )}
        <div className="space-y-3">
          {installations.map((inst) => (
            <div
              key={inst.id}
              className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-3 space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <InputField
                  label="Nombre"
                  value={inst.name}
                  onChange={(v) => updateInstallation(inst.id, 'name', v)}
                />
                <InputField
                  label="Dirección"
                  value={inst.address ?? ''}
                  onChange={(v) => updateInstallation(inst.id, 'address', v)}
                />
                <InputField
                  label="Comuna"
                  value={inst.commune ?? ''}
                  onChange={(v) => updateInstallation(inst.id, 'commune', v)}
                />
              </div>
              <div className="flex justify-end">
                <SaveButton
                  saving={savingInstId === inst.id}
                  saved={savedInstId === inst.id}
                  onClick={() => saveInstallation(inst)}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
