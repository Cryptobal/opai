'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'

export default function ForgotPinPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/portal/cliente/forgot-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      if (!res.ok) setError('No se pudo enviar. Intenta de nuevo más tarde.')
      else setSent(true)
    } catch {
      setError('Error de conexión. Revisa tu internet e intenta de nuevo.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <Shield className="h-10 w-10 text-status-info-fg" />
          </div>
          <CardTitle className="text-white text-xl">Recuperar acceso</CardTitle>
          <CardDescription className="text-zinc-400 text-sm">
            Ingresa el correo con el que accedes al portal. Te enviaremos un enlace para crear un nuevo PIN.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Correo electrónico</label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  autoFocus
                  autoComplete="email"
                />
              </div>
              {error && <p className="text-xs text-status-danger-fg">{error}</p>}
              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-status-info hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  'Enviar enlace de recuperación'
                )}
              </Button>
              <div className="text-center">
                <Link
                  href="/portal/cliente"
                  className="inline-flex items-center gap-1 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Volver al login
                </Link>
              </div>
            </form>
          ) : (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-10 w-10 text-status-ok-fg mx-auto" />
              <p className="text-zinc-300 text-sm">
                Si ese correo tiene acceso al portal, recibirás un email con el enlace para restablecer tu PIN. Revisa también la carpeta de spam.
              </p>
              <Link href="/portal/cliente">
                <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
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
