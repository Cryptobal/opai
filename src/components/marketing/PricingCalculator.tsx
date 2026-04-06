'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/* ---------- types ---------- */
interface CatalogPlan {
  id: string
  slug: string
  name: string
  headline: string | null
  pricePerGuard: number
  baseMinimum: number
  maxGuards: number
  featured: boolean
}

interface CatalogAddon {
  id: string
  slug: string
  name: string
  description: string | null
  pricingModel: string
  priceAmount: number
  priceUnit: string | null
  tag: string | null
}

interface CatalogPack {
  id: string
  slug: string
  name: string
  description: string | null
  addonSlugs: string[]
  discountPct: number
}

/* ---------- tag colors ---------- */
const tagColors: Record<string, string> = {
  Operacional: '#3B82F6',
  Comercial: '#F59E0B',
  Financiero: '#10B981',
  Premium: '#A855F7',
}

/* ---------- UF reference (fallback) ---------- */
const UF_REF = 38_800 // CLP approx

export function PricingCalculator() {
  const [plans, setPlans] = useState<CatalogPlan[]>([])
  const [addons, setAddons] = useState<CatalogAddon[]>([])
  const [packs, setPacks] = useState<CatalogPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [selectedPlanSlug, setSelectedPlanSlug] = useState('starter')
  const [guardCount, setGuardCount] = useState(50)
  const [activeAddons, setActiveAddons] = useState<Set<string>>(new Set())
  const [ufRate, setUfRate] = useState(UF_REF)

  /* fetch catalog */
  useEffect(() => {
    fetch('/api/marketing/catalog')
      .then((r) => r.json())
      .then((data) => {
        if (data.plans) {
          setPlans(data.plans.filter((p: CatalogPlan) => p.pricePerGuard > 0))
          setAddons(data.addons)
          setPacks(data.packs)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  /* try to fetch UF rate */
  useEffect(() => {
    fetch('/api/fx/latest')
      .then((r) => r.json())
      .then((data) => {
        if (data?.uf) setUfRate(Math.round(data.uf))
      })
      .catch(() => {}) // keep fallback
  }, [])

  const toggleAddon = useCallback((slug: string) => {
    setActiveAddons((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }, [])

  /* ---------- calculations ---------- */
  const selectedPlan = plans.find((p) => p.slug === selectedPlanSlug)
  const planBase = selectedPlan
    ? Math.max(selectedPlan.pricePerGuard * guardCount, selectedPlan.baseMinimum)
    : 0

  let addonsTotal = 0
  activeAddons.forEach((slug) => {
    const addon = addons.find((a) => a.slug === slug)
    if (!addon) return
    if (addon.pricingModel === 'per_guard') {
      addonsTotal += addon.priceAmount * guardCount
    } else {
      addonsTotal += addon.priceAmount
    }
  })

  /* detect best pack discount */
  let bestPack: CatalogPack | null = null
  let packDiscount = 0
  for (const pack of packs) {
    const allMatch = pack.addonSlugs.every((s) => activeAddons.has(s))
    if (allMatch && pack.discountPct > packDiscount) {
      bestPack = pack
      packDiscount = pack.discountPct
    }
  }

  const discountAmount = packDiscount > 0 ? addonsTotal * (packDiscount / 100) : 0
  const totalUF = planBase + addonsTotal - discountAmount
  const totalCLP = Math.round(totalUF * ufRate)

  /* ---------- build CTA query ---------- */
  const ctaParams = new URLSearchParams()
  if (selectedPlanSlug) ctaParams.set('plan', selectedPlanSlug)
  if (activeAddons.size) ctaParams.set('addons', Array.from(activeAddons).join(','))
  ctaParams.set('guards', String(guardCount))

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--mk-muted)' }}>
        Cargando cotizador...
      </div>
    )
  }

  if (error || plans.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--mk-muted)', fontSize: '0.9rem' }}>
        No se pudieron cargar los planes. <Link href="/contacto" style={{ color: 'var(--mk-teal)' }}>Contacta a ventas</Link> para una cotización personalizada.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* Plan selector + Guard slider */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
      }}>
        {/* Plan selector */}
        <div style={{
          background: 'var(--mk-bg-card)',
          border: '1px solid var(--mk-border)',
          borderRadius: '4px',
          padding: 'clamp(20px, 3vw, 28px)',
        }}>
          <h3 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--mk-text)',
            marginBottom: '16px',
          }}>
            1. Elige tu plan
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {plans.map((plan) => (
              <button
                key={plan.slug}
                onClick={() => setSelectedPlanSlug(plan.slug)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: selectedPlanSlug === plan.slug ? 'var(--mk-teal-dim)' : 'transparent',
                  border: selectedPlanSlug === plan.slug ? '1px solid var(--mk-teal-glow)' : '1px solid var(--mk-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'var(--mk-text)',
                  fontFamily: 'var(--mk-font-b)',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ fontFamily: 'var(--mk-font-h)', fontWeight: 700 }}>
                  {plan.name}
                </span>
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '11px',
                  color: 'var(--mk-teal)',
                }}>
                  UF {plan.pricePerGuard}/guardia
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Guard slider */}
        <div style={{
          background: 'var(--mk-bg-card)',
          border: '1px solid var(--mk-border)',
          borderRadius: '4px',
          padding: 'clamp(20px, 3vw, 28px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <h3 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--mk-text)',
            marginBottom: '16px',
          }}>
            2. Cantidad de guardias
          </h3>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 900,
              color: 'var(--mk-teal)',
            }}>
              {guardCount}
            </span>
            <span style={{
              display: 'block',
              fontFamily: 'var(--mk-font-m)',
              fontSize: '11px',
              color: 'var(--mk-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginTop: '4px',
            }}>
              guardias activos
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={guardCount}
            onChange={(e) => setGuardCount(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--mk-teal)',
              cursor: 'pointer',
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mk-font-m)',
            fontSize: '10px',
            color: 'var(--mk-muted)',
            marginTop: '8px',
          }}>
            <span>10</span>
            <span>500+</span>
          </div>
        </div>
      </div>

      {/* Add-ons grid */}
      <div>
        <h3 style={{
          fontFamily: 'var(--mk-font-h)',
          fontSize: '1rem',
          fontWeight: 700,
          color: 'var(--mk-text)',
          marginBottom: '16px',
        }}>
          3. Agrega módulos (opcional)
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {addons.map((addon) => {
            const isActive = activeAddons.has(addon.slug)
            const tagColor = tagColors[addon.tag || ''] || 'var(--mk-muted)'
            return (
              <button
                key={addon.slug}
                onClick={() => toggleAddon(addon.slug)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  padding: '16px 20px',
                  background: isActive ? 'var(--mk-teal-dim)' : 'var(--mk-bg-card)',
                  border: isActive ? '1px solid var(--mk-teal-glow)' : '1px solid var(--mk-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--mk-text)',
                  fontFamily: 'var(--mk-font-b)',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span style={{ fontFamily: 'var(--mk-font-h)', fontWeight: 700, fontSize: '0.9rem' }}>
                    {addon.name}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {addon.tag && (
                      <span style={{
                        fontFamily: 'var(--mk-font-m)',
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: tagColor,
                        background: tagColor + '18',
                        padding: '2px 6px',
                        borderRadius: '2px',
                      }}>
                        {addon.tag}
                      </span>
                    )}
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '3px',
                      border: isActive ? '2px solid var(--mk-teal)' : '2px solid var(--mk-border-h)',
                      background: isActive ? 'var(--mk-teal)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      color: '#020A0E',
                      fontWeight: 700,
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}>
                      {isActive ? '✓' : ''}
                    </div>
                  </div>
                </div>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>
                  {addon.description}
                </p>
                <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '11px', color: 'var(--mk-teal)' }}>
                  UF {addon.priceAmount}{addon.pricingModel === 'per_guard' ? '/guardia/mes' : '/mes'}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div style={{
        background: 'var(--mk-bg-card)',
        border: '2px solid var(--mk-teal)',
        borderRadius: '6px',
        padding: 'clamp(24px, 4vw, 36px)',
      }}>
        <h3 style={{
          fontFamily: 'var(--mk-font-h)',
          fontSize: '1.1rem',
          fontWeight: 700,
          color: 'var(--mk-text)',
          marginBottom: '20px',
        }}>
          Resumen estimado
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          {/* Plan base */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--mk-muted)', fontSize: '0.9rem' }}>
              Plan {selectedPlan?.name} ({guardCount} guardias)
            </span>
            <span style={{ fontFamily: 'var(--mk-font-m)', color: 'var(--mk-text)', fontSize: '0.9rem' }}>
              UF {planBase.toFixed(1)}
            </span>
          </div>

          {/* Addons */}
          {activeAddons.size > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--mk-muted)', fontSize: '0.9rem' }}>
                + {activeAddons.size} add-on{activeAddons.size > 1 ? 's' : ''}
              </span>
              <span style={{ fontFamily: 'var(--mk-font-m)', color: 'var(--mk-text)', fontSize: '0.9rem' }}>
                UF {addonsTotal.toFixed(1)}
              </span>
            </div>
          )}

          {/* Pack discount */}
          {bestPack && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--mk-orange)', fontSize: '0.9rem', fontWeight: 600 }}>
                {bestPack.name} ({packDiscount}% descuento)
              </span>
              <span style={{ fontFamily: 'var(--mk-font-m)', color: 'var(--mk-orange)', fontSize: '0.9rem' }}>
                - UF {discountAmount.toFixed(1)}
              </span>
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--mk-border)', margin: '4px 0' }} />

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: 'var(--mk-font-h)', fontWeight: 800, fontSize: '1rem', color: 'var(--mk-text)' }}>
              Total estimado/mes
            </span>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontFamily: 'var(--mk-font-h)',
                fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                fontWeight: 900,
                color: 'var(--mk-teal)',
              }}>
                UF {totalUF.toFixed(1)}
              </div>
              <div style={{
                fontFamily: 'var(--mk-font-m)',
                fontSize: '12px',
                color: 'var(--mk-muted)',
                marginTop: '2px',
              }}>
                ~ ${totalCLP.toLocaleString('es-CL')} CLP/mes
              </div>
            </div>
          </div>
        </div>

        <Link
          href={`/registrarse?${ctaParams.toString()}`}
          className="mk-btn-primary"
          style={{
            width: '100%',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '16px 32px',
            fontSize: '1rem',
          }}
        >
          Comenzar con este plan →
        </Link>
      </div>
    </div>
  )
}
