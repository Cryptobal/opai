'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Lock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

function SetupContent() {
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
    fetch(`/api/portal/cliente/setup?token=${encodeURIComponent(token)}`)
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
    if (!/^\d{4}$/.test(pin)) {
      setError('El PIN debe ser de 4 dígitos numéricos')
      return
    }
    if (pin !== pinConfirm) {
      setError('Los PINs no coinciden')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/portal/cliente/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al configurar el PIN')
        return
      }
      setState('success')
      setTimeout(() => router.push('/portal/cliente'), 2500)
    } catch {
      setError('Error de conexión. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <Shield className="h-10 w-10 text-status-info-fg" />
          </div>
          <CardTitle className="text-white text-xl">Portal de Clientes OPAI</CardTitle>
          <CardDescription className="text-zinc-400 text-sm">
            {state === 'loading' && 'Verificando enlace de acceso...'}
            {state === 'valid' && (firstName ? `Bienvenido, ${firstName}` : 'Crea tu PIN de acceso')}
            {state === 'invalid' && 'Enlace de acceso inválido'}
            {state === 'expired' && 'Enlace de acceso expirado'}
            {state === 'success' && '¡PIN configurado correctamente!'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state === 'loading' && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 text-status-info-fg animate-spin" />
            </div>
          )}

          {(state === 'invalid' || state === 'expired') && (
            <div className="text-center space-y-4 py-4">
              <AlertCircle className="h-10 w-10 text-status-danger-fg mx-auto" />
              <p className="text-zinc-400 text-sm">
                {state === 'expired'
                  ? 'Este enlace expiró (válido 48 horas). Contacta a tu ejecutivo Gard para solicitar un nuevo acceso.'
                  : 'Este enlace no es válido. Verifica que la URL sea correcta o solicita un nuevo acceso.'}
              </p>
            </div>
          )}

          {state === 'valid' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">RUT de la empresa</label>
                <Input
                  value={rut}
                  disabled
                  className="bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Crear PIN (4 dígitos)</label>
                <Input
                  type="password"
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="bg-zinc-800 border-zinc-700 text-white tracking-[0.5em] text-center"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Confirmar PIN</label>
                <Input
                  type="password"
                  value={pinConfirm}
                  onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  className="bg-zinc-800 border-zinc-700 text-white tracking-[0.5em] text-center"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                />
              </div>
              {error && (
                <p className="text-status-danger-fg text-sm flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </p>
              )}
              <Button
                type="submit"
                disabled={submitting || pin.length < 4}
                className="w-full bg-status-info hover:brightness-110 text-white"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Configurando...</>
                ) : (
                  <><Lock className="h-4 w-4 mr-2" /> Activar acceso</>
                )}
              </Button>
            </form>
          )}

          {state === 'success' && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-10 w-10 text-status-ok-fg mx-auto" />
              <p className="text-zinc-300 text-sm">Redirigiendo al portal...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-status-info-fg animate-spin" />
      </div>
    }>
      <SetupContent />
    </Suspense>
  )
}
