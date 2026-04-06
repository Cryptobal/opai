'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface RichCard {
  title: string
  price: string
  tag: string
  desc: string
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: '👋 ¡Hola! Soy el asistente de OPAI. ¿En qué puedo ayudarte? Puedo contarte sobre funcionalidades, planes, precios o agendar una demo.',
}

const INITIAL_SUGGESTIONS = [
  '¿Qué es OPAI?',
  'Ver planes y precios',
  '¿Cómo funciona el Face ID?',
  'Agendar demo',
]

const MAX_MESSAGES = 20

const TAG_COLORS: Record<string, string> = {
  Operacional: '#3B82F6',
  Comercial: '#F59E0B',
  Financiero: '#10B981',
  Premium: '#A855F7',
  Core: '#00D4B0',
}

/* ── Parsers ── */

function parseSuggestions(content: string): { cleanContent: string; suggestions: string[] } {
  const lines = content.trimEnd().split('\n')
  const lastLine = lines[lines.length - 1]?.trim() || ''
  const matches = [...lastLine.matchAll(/\[([^\]]+)\]/g)]
  if (matches.length >= 2) {
    return {
      cleanContent: lines.slice(0, -1).join('\n').trimEnd(),
      suggestions: matches.map((m) => m[1].trim()).filter(Boolean),
    }
  }
  return { cleanContent: content, suggestions: [] }
}

function parseRichCards(content: string): { before: string; cards: RichCard[]; after: string } {
  const cardsMatch = content.match(/:::cards\n([\s\S]*?):::/)
  if (!cardsMatch) return { before: content, cards: [], after: '' }

  const before = content.slice(0, cardsMatch.index).trimEnd()
  const after = content.slice((cardsMatch.index || 0) + cardsMatch[0].length).trimStart()
  const cardsBlock = cardsMatch[1]

  const cards: RichCard[] = []
  const cardRegex = /::card\{([^}]+)\}\n([\s\S]*?)::/g
  let m
  while ((m = cardRegex.exec(cardsBlock)) !== null) {
    const attrs = m[1]
    const desc = m[2].trim()
    const title = attrs.match(/title="([^"]+)"/)?.[1] || ''
    const price = attrs.match(/price="([^"]+)"/)?.[1] || ''
    const tag = attrs.match(/tag="([^"]+)"/)?.[1] || ''
    cards.push({ title, price, tag, desc })
  }

  return { before, cards, after }
}

/* ── Session tracking ── */

let sessionId: string | null = null

function getOrCreateSessionId(): string {
  if (sessionId) return sessionId
  try {
    const stored = sessionStorage.getItem('opai-chat-session')
    if (stored) { sessionId = stored; return stored }
  } catch { /* SSR guard */ }
  sessionId = crypto.randomUUID()
  try { sessionStorage.setItem('opai-chat-session', sessionId) } catch { /* SSR guard */ }
  return sessionId
}

function trackEvent(event: string, data?: Record<string, unknown>) {
  const sid = getOrCreateSessionId()
  const payload = {
    sessionId: sid,
    event,
    url: window.location.pathname,
    referrer: document.referrer || null,
    ...data,
  }
  fetch('/api/marketing/chat-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

/* ── Card carousel component ── */

function CardCarousel({ cards }: { cards: RichCard[] }) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div style={{ margin: '8px -14px', position: 'relative' }}>
      <div
        ref={ref}
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          padding: '4px 14px',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
        }}
      >
        {cards.map((card, i) => {
          const color = TAG_COLORS[card.tag] || 'var(--mk-teal)'
          return (
            <div
              key={i}
              style={{
                minWidth: '200px',
                maxWidth: '220px',
                flexShrink: 0,
                scrollSnapAlign: 'start',
                background: 'var(--mk-bg)',
                border: '1px solid var(--mk-border)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  lineHeight: 1.2,
                }}>
                  {card.title}
                </span>
                {card.tag && (
                  <span style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: color,
                    background: color + '18',
                    padding: '2px 5px',
                    borderRadius: '2px',
                    flexShrink: 0,
                    marginLeft: '6px',
                  }}>
                    {card.tag}
                  </span>
                )}
              </div>
              <p style={{
                color: 'var(--mk-muted)',
                fontSize: '0.72rem',
                lineHeight: 1.4,
                margin: 0,
                flex: 1,
              }}>
                {card.desc}
              </p>
              <span style={{
                fontFamily: 'var(--mk-font-m)',
                fontSize: '0.7rem',
                color: 'var(--mk-teal)',
                fontWeight: 600,
              }}>
                {card.price}
              </span>
            </div>
          )
        })}
      </div>
      {cards.length > 1 && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '24px',
          background: 'linear-gradient(to right, transparent, var(--mk-bg-card))',
          pointerEvents: 'none',
          borderRadius: '0 8px 8px 0',
        }} />
      )}
    </div>
  )
}

/* ── Message bubble ── */

function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: '12px 12px 2px 12px',
          background: 'var(--mk-teal-dim)',
          border: '1px solid var(--mk-teal-glow)',
          color: 'var(--mk-text)',
          fontSize: '0.88rem',
          lineHeight: 1.6,
          fontFamily: 'var(--mk-font-b)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  if (!msg.content) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: '12px 12px 12px 2px',
          background: 'var(--mk-bg-card)',
          border: '1px solid var(--mk-border)',
        }}>
          <span style={{ display: 'inline-flex', gap: '4px', padding: '4px 0' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--mk-muted)', animation: 'mkDot 1.4s infinite', animationDelay: '0s' }} />
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--mk-muted)', animation: 'mkDot 1.4s infinite', animationDelay: '0.2s' }} />
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--mk-muted)', animation: 'mkDot 1.4s infinite', animationDelay: '0.4s' }} />
          </span>
        </div>
      </div>
    )
  }

  const { before, cards, after } = parseRichCards(msg.content)

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        maxWidth: cards.length > 0 ? '95%' : '85%',
        padding: '10px 14px',
        borderRadius: '12px 12px 12px 2px',
        background: 'var(--mk-bg-card)',
        border: '1px solid var(--mk-border)',
        color: 'var(--mk-text)',
        fontSize: '0.88rem',
        lineHeight: 1.6,
        fontFamily: 'var(--mk-font-b)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {before && <span>{before}</span>}
        {cards.length > 0 && <CardCarousel cards={cards} />}
        {after && <span>{after}</span>}
      </div>
    </div>
  )
}

/* ── Main widget ── */

export function MarketingChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [msgCount, setMsgCount] = useState(0)
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS)
  const [contactCollected, setContactCollected] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, suggestions, scrollToBottom])
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  const handleOpen = useCallback(() => {
    setOpen(true)
    trackEvent('chat_opened')
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming || msgCount >= MAX_MESSAGES) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    setInput('')
    setMsgCount((c) => c + 1)
    setStreaming(true)
    setSuggestions([])

    trackEvent('message_sent', { messageIndex: msgCount })

    try {
      const res = await fetch('/api/marketing/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.filter((m) => m !== INITIAL_MESSAGE),
        }),
      })

      if (!res.ok) throw new Error('Error')

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream')

      const decoder = new TextDecoder()
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantContent += decoder.decode(value, { stream: true })
        const content = assistantContent
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content }
          return updated
        })
      }

      const { cleanContent, suggestions: newSuggestions } = parseSuggestions(assistantContent)
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: cleanContent }
        return updated
      })
      setSuggestions(newSuggestions)
    } catch {
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Disculpa, hubo un error. Puedes escribirnos por WhatsApp al +56 9 8230 7771 o a contacto@opai.cl.',
        }
        return updated
      })
      setSuggestions(['Reintentar', '¿Qué es OPAI?', 'Ver planes'])
    } finally {
      setStreaming(false)
    }
  }, [messages, streaming, msgCount])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleContactSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = fd.get('name') as string
    const email = fd.get('email') as string
    if (name && email) {
      trackEvent('contact_collected', { name, email })
      setContactCollected(true)
    }
  }

  const limitReached = msgCount >= MAX_MESSAGES
  const showContactPrompt = msgCount >= 4 && !contactCollected && !limitReached && !streaming

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={handleOpen}
          aria-label="Abrir chat de asistencia"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'var(--mk-teal)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,212,176,0.3)',
            transition: 'transform 0.2s',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#020A0E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: 'var(--mk-teal)',
            animation: 'mk-pulse 2s infinite',
            border: '2px solid var(--mk-bg)',
          }} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '400px',
          maxWidth: 'calc(100vw - 16px)',
          height: '520px',
          maxHeight: 'calc(100vh - 48px)',
          borderRadius: '12px',
          background: 'var(--mk-bg)',
          border: '1px solid var(--mk-border)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'mkChatOpen 0.2s ease-out',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--mk-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--mk-bg-card)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1rem', fontWeight: 800, color: 'var(--mk-text)' }}>
                OP<span style={{ color: 'var(--mk-teal)' }}>AI</span>
              </span>
              <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', color: 'var(--mk-teal)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Asistente IA
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
              style={{ background: 'none', border: 'none', color: 'var(--mk-muted)', cursor: 'pointer', fontSize: '18px', padding: '4px', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {!streaming && suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '16px',
                      border: '1px solid var(--mk-teal-glow)',
                      background: 'var(--mk-teal-dim)',
                      color: 'var(--mk-teal)',
                      fontFamily: 'var(--mk-font-b)',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                      lineHeight: 1.3,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Subtle contact collection after 4 messages */}
            {showContactPrompt && (
              <div style={{
                padding: '12px',
                background: 'var(--mk-teal-dim)',
                border: '1px solid var(--mk-teal-glow)',
                borderRadius: '8px',
                marginTop: '4px',
              }}>
                <p style={{
                  fontFamily: 'var(--mk-font-b)',
                  fontSize: '0.8rem',
                  color: 'var(--mk-text)',
                  marginBottom: '8px',
                  lineHeight: 1.4,
                }}>
                  ¿Te gustaría que te enviemos un resumen de esta conversación?
                </p>
                <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input name="name" type="text" required placeholder="Tu nombre" style={{
                    padding: '7px 10px', background: 'var(--mk-bg)', border: '1px solid var(--mk-border)',
                    borderRadius: '4px', color: 'var(--mk-text)', fontFamily: 'var(--mk-font-b)', fontSize: '0.8rem', outline: 'none',
                  }} />
                  <input name="email" type="email" required placeholder="tu@empresa.cl" style={{
                    padding: '7px 10px', background: 'var(--mk-bg)', border: '1px solid var(--mk-border)',
                    borderRadius: '4px', color: 'var(--mk-text)', fontFamily: 'var(--mk-font-b)', fontSize: '0.8rem', outline: 'none',
                  }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" style={{
                      padding: '6px 14px', background: 'var(--mk-teal)', border: 'none', borderRadius: '4px',
                      color: '#020A0E', fontFamily: 'var(--mk-font-h)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                    }}>
                      Enviar
                    </button>
                    <button type="button" onClick={() => setContactCollected(true)} style={{
                      padding: '6px 14px', background: 'none', border: 'none', color: 'var(--mk-muted)', fontSize: '0.75rem', cursor: 'pointer',
                    }}>
                      No, gracias
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--mk-border)', background: 'var(--mk-bg-card)', flexShrink: 0 }}>
            {limitReached ? (
              <p style={{ color: 'var(--mk-muted)', fontSize: '0.82rem', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
                Para seguir conversando,{' '}
                <a href="/registrarse" style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}>crea tu cuenta gratis</a>
                {' '}o escríbenos por{' '}
                <a href="https://wa.me/56982307771" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mk-teal)', textDecoration: 'underline' }}>WhatsApp</a>.
              </p>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe tu pregunta..."
                  disabled={streaming}
                  style={{
                    flex: 1, padding: '10px 14px', background: 'var(--mk-bg)', border: '1px solid var(--mk-border)',
                    borderRadius: '6px', color: 'var(--mk-text)', fontFamily: 'var(--mk-font-b)', fontSize: '0.88rem', outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  aria-label="Enviar mensaje"
                  style={{
                    padding: '10px 14px', background: 'var(--mk-teal)', border: 'none', borderRadius: '6px',
                    cursor: streaming || !input.trim() ? 'default' : 'pointer',
                    opacity: streaming || !input.trim() ? 0.5 : 1,
                    color: '#020A0E', fontWeight: 700, fontSize: '0.88rem', transition: 'opacity 0.2s',
                  }}
                >
                  →
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
