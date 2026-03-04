'use client'
import { useEffect } from 'react'

export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-cliente.js', { scope: '/portal/cliente' })
        .then((reg) => console.log('[Portal] SW registered', reg.scope))
        .catch((err) => console.error('[Portal] SW error', err))
    }
  }, [])
  return null
}
