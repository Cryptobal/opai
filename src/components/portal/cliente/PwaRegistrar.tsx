'use client'
import { useEffect } from 'react'

export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    async function setup() {
      // Unregister old portal-specific SWs (sw-cliente.js, etc.) before
      // registering the unified sw.js so push notifications work correctly.
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations
          .filter((r) => !r.active?.scriptURL.endsWith('/sw.js'))
          .map((r) => r.unregister())
      )
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.error('[Portal Cliente] SW error', err))
    }

    setup().catch((err) => console.error('[Portal Cliente] SW setup error', err))
  }, [])
  return null
}
