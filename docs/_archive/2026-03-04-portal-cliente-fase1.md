# Portal Cliente — Fase 1: Fundación

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extender el portal cliente existente con schema Prisma nuevo, auth extendida (magic link + PIN 6 dígitos + rate limiting), sistema de visibilidad configurable por módulo, navegación dinámica, y vistas de Instalaciones y Guardias.

**Architecture:** El portal ya tiene login RUT+PIN, dashboard con KPIs, chat y contratos. Esta fase extiende el schema, añade magic link de primer acceso, panel admin de visibilidad por cuenta, refactoriza el portal a navegación multi-sección y añade vistas de instalaciones y guardias. Todos los datos del portal se filtran siempre por `accountId` derivado de la sesión (nunca del request body/query).

**Tech Stack:** Next.js 15 App Router, Prisma (schema crm), bcryptjs, Tailwind + shadcn, Lucide React, Recharts (ya instalado).

---

## Archivos de referencia clave

- `src/lib/portal-cliente.ts` — validateClienteSession, ClienteSession interface
- `src/app/portal/cliente/PortalClienteClient.tsx` — componente principal actual (453 líneas)
- `src/app/portal/cliente/layout.tsx` — layout con metadata
- `src/app/api/portal/cliente/auth/route.ts` — login endpoint
- `src/components/crm/AccountPortalSection.tsx` — panel admin portal
- `prisma/schema.prisma` — modelos CrmAccount (schema crm), CrmContact (schema crm)
- `src/components/opai/` — design system (KpiCard, KpiGrid, etc.)

---

## Tarea 1: Prisma Schema — Extender CrmAccount y CrmContact

**Archivos:**
- Modify: `prisma/schema.prisma` (buscar `model CrmAccount` y `model CrmContact` en schema crm)

### Paso 1: Leer el schema actual

Abrir `prisma/schema.prisma` y buscar el bloque de `CrmAccount` (schema crm) y `CrmContact` (schema crm).

### Paso 2: Agregar `portalConfig` en CrmAccount

Dentro del model `CrmAccount`, agregar después del campo `status` o al final de campos simples:

```prisma
portalConfig         Json?    // Configuración de visibilidad del portal cliente
```

### Paso 3: Agregar campos magic link y rate limiting en CrmContact

Dentro del model `CrmContact`, agregar después de `portalLastAccessIp`:

```prisma
portalMagicToken     String?   // Token único para primer acceso / reset PIN
portalMagicTokenExp  DateTime? // Expiración del magic link (48h)
portalLoginAttempts  Int       @default(0)
portalLockedUntil    DateTime? // Bloqueo por intentos fallidos
```

### Paso 4: Agregar nuevos modelos al final del schema crm

Al final de la sección del schema crm (después del último modelo crm), agregar:

```prisma
model PortalClienteAlertConfig {
  id          String   @id @default(cuid())
  tenantId    String
  contactId   String
  accountId   String
  alertType   String   // guard_absent, ronda_incomplete, checkpoint_missed, incident, new_document, ticket_replied, quote_pending, contract_expiring
  channels    Json     // { push: true, email: false }
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@schema("crm")
}

model PortalClienteReporte {
  id             String    @id @default(cuid())
  tenantId       String
  accountId      String
  installationId String
  period         String    // '2026-03'
  pdfUrl         String?
  generatedAt    DateTime?
  sentAt         DateTime?
  data           Json      // KPIs del periodo
  createdAt      DateTime  @default(now())

  @@schema("crm")
}

model PortalClienteDemoData {
  id          String   @id @default(cuid())
  tenantId    String
  contactId   String   @unique
  demoData    Json     // Datos generados por IA
  generatedAt DateTime @default(now())

  @@schema("crm")
}

model PortalClienteAuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  contactId String
  action    String   // login, view_dashboard, view_guard, download_doc, etc.
  resource  String?  // installationId, guardiaId, documentId, etc.
  metadata  Json?
  ip        String?
  createdAt DateTime @default(now())

  @@schema("crm")
}
```

### Paso 5: Crear y aplicar migración

```bash
cd /Users/caco/Desktop/Cursor/opai
npx prisma migrate dev --name add_portal_cliente_extensions --schema prisma/schema.prisma
```

Expected: Migración exitosa con 4 nuevos modelos y campos añadidos.

Si hay error de schema, verificar que el `@@schema("crm")` esté correcto revisando cómo otros modelos crm lo usan.

### Paso 6: Generar cliente Prisma

```bash
npx prisma generate
```

### Paso 7: Commit

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(portal): add portal config, magic link fields, audit and alert models"
```

---

## Tarea 2: DEFAULT_PORTAL_CONFIG y extensión de ClienteSession

**Archivos:**
- Modify: `src/lib/portal-cliente.ts`

### Paso 1: Leer el archivo actual

Leer `src/lib/portal-cliente.ts` completo para entender la interface `ClienteSession` y `validateClienteSession`.

### Paso 2: Agregar DEFAULT_PORTAL_CONFIG y tipo

Al inicio del archivo, después de los imports:

```typescript
export type PortalConfig = {
  dashboard: boolean
  guardias: boolean
  liquidaciones: boolean
  asistencia: boolean
  pautas: boolean
  examenes: boolean
  rondas: boolean
  posta: boolean
  documentacion: boolean
  cotizaciones: boolean
  chat_instalacion: boolean
  chat_grupos: boolean
  tickets: boolean
  encuestas: boolean
  reportes: boolean
  comparativa: boolean
  alertas: boolean
}

export const DEFAULT_PORTAL_CONFIG: PortalConfig = {
  dashboard: true,
  guardias: true,
  liquidaciones: false,
  asistencia: true,
  pautas: false,
  examenes: false,
  rondas: true,
  posta: true,
  documentacion: true,
  cotizaciones: true,
  chat_instalacion: true,
  chat_grupos: true,
  tickets: true,
  encuestas: false,
  reportes: true,
  comparativa: true,
  alertas: true,
}
```

### Paso 3: Extender ClienteSession interface

```typescript
export interface ClienteSession {
  contactId: string
  tenantId: string
  accountId: string
  accountName: string
  firstName: string
  lastName: string
  email: string | null
  installations: Array<{ id: string; name: string }>
  authenticatedAt: string
  portalConfig: PortalConfig      // NUEVO
  isProspect: boolean             // NUEVO
  hasDemoData: boolean            // NUEVO
}
```

### Paso 4: Extender validateClienteSession para devolver nuevos campos

En la query de Prisma dentro de `validateClienteSession`, incluir `portalConfig` del account y el `status`:

```typescript
// En el select del account:
portalConfig: true,
status: true,
```

Al construir el return object:

```typescript
const rawConfig = account.portalConfig as Partial<PortalConfig> | null
const portalConfig: PortalConfig = rawConfig
  ? { ...DEFAULT_PORTAL_CONFIG, ...rawConfig }
  : DEFAULT_PORTAL_CONFIG

// Verificar si hay demo data
const hasDemoData = await prisma.portalClienteDemoData.findUnique({
  where: { contactId: contact.id },
  select: { id: true },
}) !== null

return {
  success: true,
  session: {
    // ... campos existentes ...
    portalConfig,
    isProspect: account.status === 'prospect',
    hasDemoData,
  },
}
```

### Paso 5: Commit

```bash
git add src/lib/portal-cliente.ts
git commit -m "feat(portal): extend ClienteSession with portalConfig, isProspect, hasDemoData"
```

---

## Tarea 3: Auth Extendida — Rate Limiting y PIN 6 dígitos

**Archivos:**
- Modify: `src/app/api/portal/cliente/auth/route.ts`

### Paso 1: Leer el archivo actual

### Paso 2: Actualizar la API de auth con rate limiting

El nuevo flujo en POST /api/portal/cliente/auth:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateClienteSession } from '@/lib/portal-cliente'

export async function POST(req: NextRequest) {
  const { rut, pin } = await req.json()
  const ip = req.headers.get('x-forwarded-for') ?? req.ip ?? 'unknown'

  if (!rut || !pin) {
    return NextResponse.json({ error: 'RUT y PIN requeridos' }, { status: 400 })
  }

  // Buscar el contacto por RUT (normalizar antes)
  const normalizedRut = normalizeRut(rut)
  const contact = await prisma.crmContact.findFirst({
    where: {
      portalEnabled: true,
      account: {
        OR: [
          { rut: normalizedRut },
          // otros formatos
        ],
      },
    },
    select: {
      id: true,
      portalLoginAttempts: true,
      portalLockedUntil: true,
    },
  })

  if (contact) {
    // Verificar si está bloqueado
    if (contact.portalLockedUntil && contact.portalLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (contact.portalLockedUntil.getTime() - Date.now()) / 60000
      )
      return NextResponse.json(
        { error: `Cuenta bloqueada. Intenta en ${minutesLeft} minutos.` },
        { status: 429 }
      )
    }
  }

  const result = await validateClienteSession(rut, pin, ip)

  if (!result.success) {
    // Incrementar intentos fallidos
    if (contact) {
      const newAttempts = (contact.portalLoginAttempts ?? 0) + 1
      const updates: Record<string, unknown> = { portalLoginAttempts: newAttempts }
      if (newAttempts >= 5) {
        updates.portalLockedUntil = new Date(Date.now() + 15 * 60 * 1000)
        updates.portalLoginAttempts = 0
      }
      await prisma.crmContact.update({
        where: { id: contact.id },
        data: updates,
      })
    }
    return NextResponse.json({ error: result.error }, { status: 401 })
  }

  // Resetear intentos al hacer login exitoso
  if (contact) {
    await prisma.crmContact.update({
      where: { id: contact.id },
      data: { portalLoginAttempts: 0, portalLockedUntil: null },
    })
  }

  // Log de auditoría
  await prisma.portalClienteAuditLog.create({
    data: {
      tenantId: result.session!.tenantId,
      contactId: result.session!.contactId,
      action: 'login',
      ip,
    },
  })

  return NextResponse.json({ session: result.session })
}
```

**Nota:** El helper `normalizeRut` ya debe existir en `portal-cliente.ts`; importarlo o duplicar la normalización inline.

### Paso 3: Commit

```bash
git add src/app/api/portal/cliente/auth/route.ts
git commit -m "feat(portal): add rate limiting and audit log to auth endpoint"
```

---

## Tarea 4: Magic Link — Setup de Primer Acceso

**Archivos:**
- Create: `src/app/api/portal/cliente/setup/route.ts`
- Create: `src/app/portal/cliente/setup/page.tsx`

### Paso 1: Crear API de setup

```typescript
// src/app/api/portal/cliente/setup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { token, pin } = await req.json()

  if (!token || !pin) {
    return NextResponse.json({ error: 'Token y PIN requeridos' }, { status: 400 })
  }

  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'El PIN debe ser de 6 dígitos' }, { status: 400 })
  }

  const contact = await prisma.crmContact.findFirst({
    where: { portalMagicToken: token },
    include: { account: { select: { rut: true, name: true } } },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }

  if (contact.portalMagicTokenExp && contact.portalMagicTokenExp < new Date()) {
    return NextResponse.json({ error: 'Token expirado' }, { status: 400 })
  }

  const hashedPin = await bcrypt.hash(pin, 10)

  await prisma.crmContact.update({
    where: { id: contact.id },
    data: {
      portalPin: hashedPin,
      portalEnabled: true,
      portalMagicToken: null,
      portalMagicTokenExp: null,
    },
  })

  return NextResponse.json({
    success: true,
    rut: contact.account?.rut ?? '',
    name: contact.firstName,
  })
}

// GET: verificar token sin consumirlo
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  const contact = await prisma.crmContact.findFirst({
    where: { portalMagicToken: token },
    include: { account: { select: { rut: true } } },
  })

  if (!contact) {
    return NextResponse.json({ valid: false, error: 'Token inválido' })
  }

  if (contact.portalMagicTokenExp && contact.portalMagicTokenExp < new Date()) {
    return NextResponse.json({ valid: false, error: 'Token expirado' })
  }

  return NextResponse.json({
    valid: true,
    rut: contact.account?.rut ?? '',
    firstName: contact.firstName,
  })
}
```

### Paso 2: Crear página de setup

```typescript
// src/app/portal/cliente/setup/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Lock, AlertCircle, CheckCircle } from 'lucide-react'

export default function SetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'success'>('loading')
  const [rut, setRut] = useState('')
  const [firstName, setFirstName] = useState('')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setState('invalid'); return }
    fetch(`/api/portal/cliente/setup?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setRut(data.rut ?? '')
          setFirstName(data.firstName ?? '')
          setState('valid')
        } else {
          setState(data.error === 'Token expirado' ? 'expired' : 'invalid')
        }
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('El PIN debe ser de 6 dígitos numéricos'); return }
    if (pin !== pinConfirm) { setError('Los PINs no coinciden'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/cliente/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al configurar PIN'); return }
      setState('success')
      setTimeout(() => router.push('/portal/cliente'), 2000)
    } catch {
      setError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-blue-400" />
          </div>
          <CardTitle className="text-white text-2xl">Portal Gard Security</CardTitle>
          <CardDescription className="text-zinc-400">
            {state === 'loading' && 'Verificando acceso...'}
            {state === 'valid' && `Bienvenido${firstName ? `, ${firstName}` : ''}. Crea tu PIN de acceso.`}
            {state === 'invalid' && 'Link de acceso inválido'}
            {state === 'expired' && 'Link de acceso expirado'}
            {state === 'success' && 'PIN configurado exitosamente'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === 'loading' && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
            </div>
          )}

          {(state === 'invalid' || state === 'expired') && (
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
              <p className="text-zinc-400 text-sm">
                {state === 'expired'
                  ? 'El link expiró (válido 48h). Contacta a tu ejecutivo Gard para solicitar un nuevo acceso.'
                  : 'Este link no es válido. Verifica que la URL sea correcta.'}
              </p>
            </div>
          )}

          {state === 'valid' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 text-sm mb-1 block">RUT de empresa</label>
                <Input value={rut} disabled className="bg-zinc-800 border-zinc-700 text-zinc-300" />
              </div>
              <div>
                <label className="text-zinc-400 text-sm mb-1 block">Crear PIN (6 dígitos)</label>
                <Input
                  type="password"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="bg-zinc-800 border-zinc-700 text-white tracking-widest"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              <div>
                <label className="text-zinc-400 text-sm mb-1 block">Confirmar PIN</label>
                <Input
                  type="password"
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="bg-zinc-800 border-zinc-700 text-white tracking-widest"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700">
                <Lock className="h-4 w-4 mr-2" />
                {submitting ? 'Configurando...' : 'Activar acceso'}
              </Button>
            </form>
          )}

          {state === 'success' && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
              <p className="text-zinc-300">Redirigiendo al portal...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

### Paso 3: Commit

```bash
git add src/app/api/portal/cliente/setup/ src/app/portal/cliente/setup/
git commit -m "feat(portal): add magic link setup flow for first access"
```

---

## Tarea 5: Forgot PIN

**Archivos:**
- Create: `src/app/api/portal/cliente/forgot-pin/route.ts`
- Create: `src/app/portal/cliente/forgot-pin/page.tsx`

### Paso 1: API forgot-pin

```typescript
// src/app/api/portal/cliente/forgot-pin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { rut } = await req.json()
  if (!rut) return NextResponse.json({ error: 'RUT requerido' }, { status: 400 })

  // Buscar cuenta por RUT
  const account = await prisma.crmAccount.findFirst({
    where: {
      OR: [
        { rut },
        { rut: rut.replace(/\./g, '').replace(/-/g, '') },
      ],
    },
    include: {
      contacts: {
        where: { portalEnabled: true },
        select: { id: true, email: true, firstName: true },
        take: 1,
      },
    },
  })

  // Responder siempre igual para no revelar existencia
  const RESPONSE = NextResponse.json({ success: true })

  if (!account || account.contacts.length === 0) return RESPONSE

  const contact = account.contacts[0]
  if (!contact.email) return RESPONSE

  const token = crypto.randomUUID()
  const exp = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await prisma.crmContact.update({
    where: { id: contact.id },
    data: { portalMagicToken: token, portalMagicTokenExp: exp },
  })

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://app.gardsecurity.cl'
  await resend.emails.send({
    from: 'Gard Security <noreply@gardsecurity.cl>',
    to: contact.email,
    subject: 'Restablecer PIN — Portal Gard Security',
    html: `
      <p>Hola ${contact.firstName},</p>
      <p>Recibimos una solicitud para restablecer tu PIN del portal.</p>
      <p><a href="${baseUrl}/portal/cliente/setup?token=${token}">Haz clic aquí para crear un nuevo PIN</a></p>
      <p>Este link expira en 48 horas. Si no solicitaste esto, ignora este email.</p>
    `,
  })

  return RESPONSE
}
```

### Paso 2: Página forgot-pin

```typescript
// src/app/portal/cliente/forgot-pin/page.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, ArrowLeft, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPinPage() {
  const [rut, setRut] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await fetch('/api/portal/cliente/forgot-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rut }),
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="h-12 w-12 text-blue-400" />
          </div>
          <CardTitle className="text-white text-xl">Recuperar acceso</CardTitle>
          <CardDescription className="text-zinc-400">
            Te enviaremos un link para crear un nuevo PIN
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 text-sm mb-1 block">RUT de empresa</label>
                <Input
                  value={rut}
                  onChange={e => setRut(e.target.value)}
                  placeholder="12.345.678-9"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                {loading ? 'Enviando...' : 'Enviar link de recuperación'}
              </Button>
              <Link href="/portal/cliente" className="flex items-center justify-center gap-1 text-zinc-500 text-sm hover:text-zinc-300 mt-2">
                <ArrowLeft className="h-3 w-3" /> Volver al login
              </Link>
            </form>
          ) : (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
              <p className="text-zinc-300 text-sm">
                Si existe una cuenta con ese RUT, recibirás un email con instrucciones.
              </p>
              <Link href="/portal/cliente">
                <Button variant="outline" className="border-zinc-700 text-zinc-300">
                  <ArrowLeft className="h-4 w-4 mr-2" /> Volver al login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

### Paso 3: Commit

```bash
git add src/app/api/portal/cliente/forgot-pin/ src/app/portal/cliente/forgot-pin/
git commit -m "feat(portal): add forgot PIN flow with email recovery"
```

---

## Tarea 6: API — Portal Config (Admin)

**Archivos:**
- Create: `src/app/api/crm/accounts/[id]/portal-config/route.ts`

### Paso 1: Crear el endpoint PATCH

```typescript
// src/app/api/crm/accounts/[id]/portal-config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DEFAULT_PORTAL_CONFIG } from '@/lib/portal-cliente'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { portalConfig } = await req.json()
  if (!portalConfig) {
    return NextResponse.json({ error: 'portalConfig requerido' }, { status: 400 })
  }

  // Merge con defaults para asegurar todos los campos
  const merged = { ...DEFAULT_PORTAL_CONFIG, ...portalConfig }

  const account = await prisma.crmAccount.update({
    where: { id: params.id, tenantId: session.user.tenantId },
    data: { portalConfig: merged },
    select: { id: true, portalConfig: true },
  })

  return NextResponse.json(account)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const account = await prisma.crmAccount.findUnique({
    where: { id: params.id, tenantId: session.user.tenantId },
    select: { portalConfig: true },
  })

  const config = account?.portalConfig
    ? { ...DEFAULT_PORTAL_CONFIG, ...(account.portalConfig as object) }
    : DEFAULT_PORTAL_CONFIG

  return NextResponse.json({ portalConfig: config })
}
```

### Paso 2: Commit

```bash
git add src/app/api/crm/accounts/
git commit -m "feat(portal): add PATCH/GET portal-config endpoint for admin"
```

---

## Tarea 7: AccountPortalSection — Panel de Toggles

**Archivos:**
- Modify: `src/components/crm/AccountPortalSection.tsx`

### Paso 1: Leer el componente actual completo

### Paso 2: Agregar sección de configuración de módulos

Después del panel existente de gestión de PIN/acceso, añadir una nueva sección colapsable:

```typescript
// Importar al inicio:
import { DEFAULT_PORTAL_CONFIG, PortalConfig } from '@/lib/portal-cliente'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, Settings } from 'lucide-react'

// Estado adicional en el componente:
const [portalConfig, setPortalConfig] = useState<PortalConfig>(DEFAULT_PORTAL_CONFIG)
const [savingConfig, setSavingConfig] = useState(false)

// useEffect para cargar config actual:
useEffect(() => {
  fetch(`/api/crm/accounts/${accountId}/portal-config`)
    .then(r => r.json())
    .then(data => setPortalConfig(data.portalConfig ?? DEFAULT_PORTAL_CONFIG))
}, [accountId])

// Función para guardar:
async function savePortalConfig(newConfig: PortalConfig) {
  setSavingConfig(true)
  await fetch(`/api/crm/accounts/${accountId}/portal-config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portalConfig: newConfig }),
  })
  setSavingConfig(false)
}

// Definición de labels:
const MODULE_LABELS: Record<keyof PortalConfig, string> = {
  dashboard: 'Dashboard',
  guardias: 'Guardias',
  liquidaciones: 'Liquidaciones',
  asistencia: 'Asistencia',
  pautas: 'Pautas',
  examenes: 'Exámenes',
  rondas: 'Rondas',
  posta: 'Posta / Bitácora',
  documentacion: 'Documentación',
  cotizaciones: 'Cotizaciones',
  chat_instalacion: 'Chat por instalación',
  chat_grupos: 'Chat grupos Gard',
  tickets: 'Tickets',
  encuestas: 'Encuestas',
  reportes: 'Reportes',
  comparativa: 'Vista comparativa',
  alertas: 'Alertas',
}
```

En el JSX, añadir dentro del Card existente (después de la sección de contactos):

```tsx
<Collapsible>
  <CollapsibleTrigger className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm w-full py-2">
    <Settings className="h-4 w-4" />
    Módulos visibles en el portal
    <ChevronDown className="h-4 w-4 ml-auto" />
  </CollapsibleTrigger>
  <CollapsibleContent>
    <div className="grid grid-cols-2 gap-3 pt-3 pb-2">
      {(Object.keys(MODULE_LABELS) as (keyof PortalConfig)[]).map(key => (
        <div key={key} className="flex items-center gap-2">
          <Switch
            id={`module-${key}`}
            checked={portalConfig[key]}
            disabled={savingConfig}
            onCheckedChange={checked => {
              const updated = { ...portalConfig, [key]: checked }
              setPortalConfig(updated)
              savePortalConfig(updated)
            }}
          />
          <Label htmlFor={`module-${key}`} className="text-zinc-300 text-sm cursor-pointer">
            {MODULE_LABELS[key]}
          </Label>
        </div>
      ))}
    </div>
    {savingConfig && <p className="text-zinc-500 text-xs">Guardando...</p>}
  </CollapsibleContent>
</Collapsible>
```

### Paso 3: Commit

```bash
git add src/components/crm/AccountPortalSection.tsx
git commit -m "feat(portal): add module visibility toggles to AccountPortalSection"
```

---

## Tarea 8: Refactorizar PortalClienteClient — Navegación Dinámica

**Archivos:**
- Modify: `src/app/portal/cliente/PortalClienteClient.tsx`
- Create: `src/components/portal/cliente/PortalClienteNav.tsx`
- Create: `src/components/portal/cliente/PortalDashboard.tsx`
- Create: `src/components/portal/cliente/PortalInstallations.tsx`
- Create: `src/components/portal/cliente/PortalGuards.tsx`

### Paso 1: Crear PortalClienteNav.tsx

```typescript
// src/components/portal/cliente/PortalClienteNav.tsx
'use client'

import { LayoutDashboard, Building2, MapPin, MessageSquare, Ticket, FileText, Receipt, BarChart3, GitCompare, Bell } from 'lucide-react'
import { PortalConfig } from '@/lib/portal-cliente'
import { cn } from '@/lib/utils'

type Section =
  | 'dashboard' | 'instalaciones' | 'rondas' | 'chat'
  | 'tickets' | 'documentacion' | 'cotizaciones'
  | 'reportes' | 'comparativa' | 'alertas'

const NAV_ITEMS: Array<{
  id: Section
  label: string
  icon: React.FC<{ className?: string }>
  configKey?: keyof PortalConfig
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, configKey: 'dashboard' },
  { id: 'instalaciones', label: 'Instalaciones', icon: Building2, configKey: 'guardias' },
  { id: 'rondas', label: 'Rondas', icon: MapPin, configKey: 'rondas' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, configKey: 'chat_instalacion' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, configKey: 'tickets' },
  { id: 'documentacion', label: 'Documentos', icon: FileText, configKey: 'documentacion' },
  { id: 'cotizaciones', label: 'Cotizaciones', icon: Receipt, configKey: 'cotizaciones' },
  { id: 'reportes', label: 'Reportes', icon: BarChart3, configKey: 'reportes' },
  { id: 'comparativa', label: 'Comparativa', icon: GitCompare, configKey: 'comparativa' },
  { id: 'alertas', label: 'Alertas', icon: Bell, configKey: 'alertas' },
]

interface Props {
  portalConfig: PortalConfig
  activeSection: Section
  onSection: (s: Section) => void
}

export function PortalClienteNav({ portalConfig, activeSection, onSection }: Props) {
  const visibleItems = NAV_ITEMS.filter(item =>
    !item.configKey || portalConfig[item.configKey]
  )

  // Primeros 5 en bottom nav, resto en menú Más
  const mainItems = visibleItems.slice(0, 5)

  return (
    // Bottom nav (móvil)
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 z-50 md:hidden">
      <div className="flex items-center justify-around h-16">
        {mainItems.map(item => {
          const Icon = item.icon
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              onClick={() => onSection(item.id)}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-1 rounded-md transition-colors',
                active ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] leading-none">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
```

### Paso 2: Refactorizar PortalClienteClient.tsx

El componente actual tiene todo el dashboard inline. El objetivo es:
1. Mantener el estado de sesión y autenticación tal como está
2. Reemplazar el renderizado del dashboard por un sistema de secciones usando `activeSection` state
3. Importar `PortalClienteNav` para la navegación

Modificaciones clave en `PortalClienteClient.tsx`:

```typescript
// Agregar estado de sección:
const [activeSection, setActiveSection] = useState<Section>('dashboard')

// Agregar portalConfig desde la sesión:
const portalConfig = session?.portalConfig ?? DEFAULT_PORTAL_CONFIG

// Reemplazar el contenido del dashboard con routing por sección:
function renderSection() {
  switch (activeSection) {
    case 'dashboard':
      return <PortalDashboard session={session} selectedInstallation={selectedInstallation} />
    case 'instalaciones':
      return <PortalInstallations session={session} />
    case 'chat':
      return <ChatClienteSection session={session} />
    case 'documentacion':
      return <PortalContractsSection session={session} />
    // Secciones placeholder para Fase 2-3:
    default:
      return (
        <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
          <p>Sección en desarrollo</p>
        </div>
      )
  }
}

// En el JSX del dashboard state, reemplazar el contenido por:
<>
  {renderSection()}
  <PortalClienteNav
    portalConfig={portalConfig}
    activeSection={activeSection}
    onSection={setActiveSection}
  />
</>
```

**Nota:** Mover el código de KPIs/chart/guards del dashboard actual a `PortalDashboard.tsx` para mantener DRY.

### Paso 3: Crear PortalDashboard.tsx

Extraer la lógica del dashboard actual (KPI cards, compliance chart, guards leaderboard, activity feed) de `PortalClienteClient.tsx` y encapsularla en:

```typescript
// src/components/portal/cliente/PortalDashboard.tsx
'use client'
// ... imports del recharts, etc. (mismos que usa PortalClienteClient hoy)

interface Props {
  session: ClienteSession
  selectedInstallation: string
}

export function PortalDashboard({ session, selectedInstallation }: Props) {
  // Mover todo el estado y fetching del dashboard actual aquí
  // (compliance, kpis, guards, activity)
}
```

### Paso 4: Crear PortalInstallations.tsx (vista básica)

```typescript
// src/components/portal/cliente/PortalInstallations.tsx
'use client'
import { ClienteSession } from '@/lib/portal-cliente'
import { Building2, MapPin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  session: ClienteSession
}

export function PortalInstallations({ session }: Props) {
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-white font-semibold text-lg">Instalaciones</h2>
      <div className="space-y-2">
        {session.installations.map(inst => (
          <Card key={inst.id} className="bg-zinc-800 border-zinc-700">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="bg-blue-500/10 rounded-lg p-2">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-medium">{inst.name}</p>
                <p className="text-zinc-500 text-sm flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {inst.id}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

### Paso 5: Crear PortalGuards.tsx (stub para Fase 1)

```typescript
// src/components/portal/cliente/PortalGuards.tsx
'use client'
// Vista básica de guardias — se extiende en Fase 2
import { ClienteSession } from '@/lib/portal-cliente'
import { UserCheck } from 'lucide-react'

export function PortalGuards({ session }: { session: ClienteSession }) {
  return (
    <div className="p-4">
      <h2 className="text-white font-semibold text-lg mb-4">Guardias</h2>
      <p className="text-zinc-500 text-sm">
        Selecciona una instalación para ver los guardias asignados.
      </p>
    </div>
  )
}
```

### Paso 6: Commit

```bash
git add src/components/portal/cliente/ src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal): refactor to multi-section navigation with dynamic portalConfig"
```

---

## Tarea 9: Login — Agregar link a forgot-pin

**Archivos:**
- Modify: `src/app/portal/cliente/PortalClienteClient.tsx`

En la pantalla de login (state === 'login'), agregar debajo del botón de login:

```tsx
<Link
  href="/portal/cliente/forgot-pin"
  className="text-zinc-500 text-sm hover:text-zinc-300 text-center block mt-2"
>
  ¿Olvidaste tu PIN?
</Link>
```

### Paso final: Commit

```bash
git add src/app/portal/cliente/PortalClienteClient.tsx
git commit -m "feat(portal): add forgot PIN link to login screen"
```

---

## Tarea 10: Verificación de Fase 1

### Paso 1: Build

```bash
cd /Users/caco/Desktop/Cursor/opai
npm run build
```

Expected: Build exitoso sin errores TypeScript.

### Paso 2: Verificar rutas existentes no rompieron

```bash
npm run dev
```

Navegar a:
- `/portal/cliente` — debe cargar login
- `/portal/cliente/setup?token=invalid` — debe mostrar "Token inválido"
- `/portal/cliente/forgot-pin` — debe mostrar formulario

### Paso 3: Verificar panel admin

En el CRM admin → cualquier cuenta → AccountPortalSection → debe mostrar grilla de toggles de módulos.

### Paso 4: Commit final de documentación

```bash
git add docs/
git commit -m "docs: update portal cliente implementation plan progress"
```

---

## Checklist de Criterios de Aceptación (Fase 1)

- [ ] Migración Prisma exitosa (portalConfig, magic link fields, nuevos modelos)
- [ ] `validateClienteSession` retorna `portalConfig`, `isProspect`, `hasDemoData`
- [ ] Rate limiting de login (5 intentos → 15 min bloqueo) funciona
- [ ] Setup page con magic link crea PIN y redirige al portal
- [ ] Forgot PIN envía email con link de reset
- [ ] Panel admin muestra y guarda toggles de módulos via API
- [ ] Portal navega entre secciones según portalConfig
- [ ] Build TypeScript sin errores

---

## Fases Siguientes (Referencias)

- **Fase 2** → `docs/plans/2026-03-04-portal-cliente-fase2.md` (Rondas, Posta, Tickets, Chat grupos, Alertas)
- **Fase 3** → `docs/plans/2026-03-04-portal-cliente-fase3.md` (Cotizaciones, Demo IA, Contrato, Firma)
- **Fase 4** → `docs/plans/2026-03-04-portal-cliente-fase4.md` (Reportes PDF, Comparativa, Encuestas, PWA, Auditoría)
