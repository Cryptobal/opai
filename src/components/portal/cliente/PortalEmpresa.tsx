'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Building2, Users, FileText, Contact, MapPin,
  Plus, Trash2, Save, CheckCircle2, Pencil, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClienteSession } from '@/lib/portal-cliente-types'
import { AddressAutocomplete, AddressResult } from '@/components/ui/AddressAutocomplete'
import { validateRut, formatRut } from '@/modules/finance/shared/validators/rut.validator'

/* ── Types ── */

interface Representante {
  id: string
  nombre: string
  rut: string
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
  city: string | null
  commune: string | null
  lat: number | null
  lng: number | null
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
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  error?: string
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-9 rounded-lg border bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors',
          error ? 'border-red-500 focus:border-red-400' : 'border-zinc-700 focus:border-teal-400'
        )}
      />
      {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
    </div>
  )
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

/* ── Main Component ── */

export function PortalEmpresa({ session }: { session: ClienteSession }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<EmpresaData | null>(null)
  const [error, setError] = useState('')

  // Section-level form states
  const [nombreFantasia, setNombreFantasia] = useState('')
  const [legalName, setLegalName] = useState('')
  const [rut, setRut] = useState('')
  const [rutError, setRutError] = useState('')
  const [address, setAddress] = useState('')
  const [commune, setCommune] = useState('')
  const [savingDatos, setSavingDatos] = useState(false)
  const [savedDatos, setSavedDatos] = useState(false)

  // Representantes
  const [representantes, setRepresentantes] = useState<Representante[]>([])
  const [newRepNombre, setNewRepNombre] = useState('')
  const [newRepRut, setNewRepRut] = useState('')
  const [newRepRutError, setNewRepRutError] = useState('')
  const [addingRep, setAddingRep] = useState(false)
  const [deletingRepId, setDeletingRepId] = useState<string | null>(null)
  const [editingRepId, setEditingRepId] = useState<string | null>(null)
  const [editRepNombre, setEditRepNombre] = useState('')
  const [editRepRut, setEditRepRut] = useState('')
  const [editRepRutError, setEditRepRutError] = useState('')
  const [savingRepId, setSavingRepId] = useState<string | null>(null)

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
  const [editingInstId, setEditingInstId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/cliente/empresa')
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const d = json.data as EmpresaData
      setData(d)
      setNombreFantasia(d.name ?? '')
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

  /* ── RUT validation helper ── */
  function validateRutField(value: string): string {
    if (!value.trim()) return ''
    const result = validateRut(value)
    return result.valid ? '' : (result.error || 'RUT inválido')
  }

  /* ── Save handlers ── */

  async function saveDatos() {
    // Validate RUT before saving
    if (rut.trim()) {
      const err = validateRutField(rut)
      if (err) {
        setRutError(err)
        return
      }
    }
    setRutError('')
    setSavingDatos(true)
    try {
      const res = await fetch('/api/portal/cliente/empresa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombreFantasia, legalName, rut, address, commune }),
      })
      const json = await res.json()
      if (json.success) flashSaved(setSavedDatos)
    } finally {
      setSavingDatos(false)
    }
  }

  async function addRepresentante() {
    if (!newRepNombre.trim() || !newRepRut.trim()) return
    const err = validateRutField(newRepRut)
    if (err) {
      setNewRepRutError(err)
      return
    }
    setNewRepRutError('')
    setAddingRep(true)
    try {
      const res = await fetch('/api/portal/cliente/empresa/representantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: newRepNombre, rut: newRepRut }),
      })
      const json = await res.json()
      if (json.success) {
        setRepresentantes((prev) => [...prev, json.data])
        setNewRepNombre('')
        setNewRepRut('')
      }
    } finally {
      setAddingRep(false)
    }
  }

  async function saveRepresentante(id: string) {
    const err = validateRutField(editRepRut)
    if (err) {
      setEditRepRutError(err)
      return
    }
    setEditRepRutError('')
    setSavingRepId(id)
    try {
      const res = await fetch('/api/portal/cliente/empresa/representantes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre: editRepNombre, rut: editRepRut }),
      })
      const json = await res.json()
      if (json.success) {
        setRepresentantes((prev) =>
          prev.map((r) => (r.id === id ? json.data : r))
        )
        setEditingRepId(null)
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

  function startEditingRep(rep: Representante) {
    setEditingRepId(rep.id)
    setEditRepNombre(rep.nombre)
    setEditRepRut(rep.rut)
    setEditRepRutError('')
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
        body: JSON.stringify({
          id: inst.id,
          name: inst.name,
          address: inst.address,
          city: inst.city,
          commune: inst.commune,
          lat: inst.lat,
          lng: inst.lng,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSavedInstId(inst.id)
        setEditingInstId(null)
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

  function updateInstallation(id: string, updates: Partial<InstallationData>) {
    setInstallations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    )
  }

  function handleInstallationAddressChange(id: string, result: AddressResult) {
    updateInstallation(id, {
      address: result.address,
      city: result.city || null,
      commune: result.commune || null,
      lat: result.lat,
      lng: result.lng,
    })
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
      {/* ── 1. Datos de la empresa ── */}
      <Card>
        <SectionHeader icon={Building2} title="Datos de la empresa" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputField label="Nombre de fantasía" value={nombreFantasia} onChange={setNombreFantasia} placeholder="Nombre comercial" />
          <InputField label="Razón social" value={legalName} onChange={setLegalName} placeholder="Razón social" />
          <InputField
            label="RUT Empresa"
            value={rut}
            onChange={(v) => {
              const formatted = formatRut(v)
              setRut(formatted)
              if (rutError) setRutError('')
            }}
            placeholder="12.345.678-9"
            error={rutError}
          />
          <InputField label="Comuna" value={commune} onChange={setCommune} placeholder="Comuna" />
        </div>
        <div className="mt-3">
          <label className="text-xs text-zinc-400 mb-1 block">Dirección</label>
          <AddressAutocomplete
            value={address}
            onChange={(result) => {
              setAddress(result.address)
              if (result.commune) setCommune(result.commune)
            }}
            placeholder="Buscar dirección..."
            showMap={false}
          />
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

        <div className="space-y-2 mb-3">
          {representantes.map((rep) => (
            <div
              key={rep.id}
              className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2"
            >
              {editingRepId === rep.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InputField
                      label="Nombre"
                      value={editRepNombre}
                      onChange={setEditRepNombre}
                    />
                    <InputField
                      label="RUT"
                      value={editRepRut}
                      onChange={(v) => {
                        setEditRepRut(formatRut(v))
                        if (editRepRutError) setEditRepRutError('')
                      }}
                      error={editRepRutError}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingRepId(null)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      <X className="h-3 w-3" />
                      Cancelar
                    </button>
                    <button
                      onClick={() => saveRepresentante(rep.id)}
                      disabled={savingRepId === rep.id}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50"
                    >
                      {savingRepId === rep.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{rep.nombre}</p>
                    <p className="text-xs text-zinc-400">{rep.rut}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEditingRep(rep)}
                      className="text-zinc-500 hover:text-teal-400 transition-colors p-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteRepresentante(rep.id)}
                      disabled={deletingRepId === rep.id}
                      className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                    >
                      {deletingRepId === rep.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newRepNombre}
            onChange={(e) => setNewRepNombre(e.target.value)}
            placeholder="Nombre"
            className="flex-1 h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-teal-400 transition-colors"
          />
          <div className="flex-1">
            <input
              type="text"
              value={newRepRut}
              onChange={(e) => {
                setNewRepRut(formatRut(e.target.value))
                if (newRepRutError) setNewRepRutError('')
              }}
              placeholder="RUT"
              className={cn(
                'w-full h-9 rounded-lg border bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors',
                newRepRutError ? 'border-red-500' : 'border-zinc-700 focus:border-teal-400'
              )}
            />
            {newRepRutError && <p className="text-xs text-red-400 mt-0.5">{newRepRutError}</p>}
          </div>
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
              <option value="Escritura publica">Escritura pública</option>
              <option value="Sociedad">Sociedad</option>
              <option value="Empresa en un dia">Empresa en un día</option>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <InputField
                  label="Nombre"
                  value={inst.name}
                  onChange={(v) => updateInstallation(inst.id, { name: v })}
                />
                {editingInstId === inst.id ? (
                  <div className="sm:col-span-2">
                    <label className="text-xs text-zinc-400 mb-1 block">Dirección</label>
                    <AddressAutocomplete
                      value={inst.address ?? ''}
                      onChange={(result) => handleInstallationAddressChange(inst.id, result)}
                      placeholder="Buscar dirección..."
                      showMap={true}
                    />
                    {inst.city && (
                      <div className="flex gap-4 mt-2 text-xs text-zinc-400">
                        <span>Ciudad: {inst.city}</span>
                        {inst.commune && <span>Comuna: {inst.commune}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="sm:col-span-1">
                    <label className="text-xs text-zinc-400 mb-1 block">Dirección</label>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white flex-1 truncate">
                        {inst.address || <span className="text-zinc-500">Sin dirección</span>}
                      </p>
                      <button
                        onClick={() => setEditingInstId(inst.id)}
                        className="text-zinc-500 hover:text-teal-400 transition-colors p-1 shrink-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {(inst.city || inst.commune) && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {[inst.commune, inst.city].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Mini mapa */}
              {inst.lat && inst.lng && GOOGLE_MAPS_API_KEY && (
                <a
                  href={`https://www.google.com/maps/@${inst.lat},${inst.lng},17z`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden border border-zinc-700/50 hover:opacity-90 transition-opacity"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${inst.lat},${inst.lng}&zoom=15&size=400x120&scale=2&markers=color:red%7C${inst.lat},${inst.lng}&key=${GOOGLE_MAPS_API_KEY}`}
                    alt={`Mapa de ${inst.name}`}
                    className="w-full h-[100px] object-cover"
                    loading="lazy"
                  />
                </a>
              )}

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
