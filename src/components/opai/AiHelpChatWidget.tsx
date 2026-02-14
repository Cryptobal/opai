"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ConversationItem = {
  id: string;
  title: string;
  updatedAt: string;
  _count?: { messages: number };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const MAX_VISIBLE_MESSAGES = 120;

function renderBoldText(text: string, keyPrefix: string) {
  const nodes: Array<JSX.Element | string> = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${keyPrefix}-b-${match.index}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : text;
}

function renderMessageContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, idx) => (
    <Fragment key={`${idx}-${line.slice(0, 12)}`}>
      {linkifyLine(line)}
      {idx < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

function linkifyLine(line: string) {
  const parts: Array<JSX.Element | string> = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(line);

  while (match) {
    if (match.index > lastIndex) {
      const textPart = line.slice(lastIndex, match.index);
      const rendered = renderBoldText(textPart, `pre-${match.index}`);
      if (Array.isArray(rendered)) parts.push(...rendered);
      else parts.push(rendered);
    }

    const label = match[1];
    const markdownHref = match[2];
    const rawHref = match[3];
    const href = markdownHref ?? rawHref;
    const text = label ?? href.replace(/^https?:\/\//, "");

    if (href) {
      parts.push(
        <a
          key={`${match.index}-${href}`}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 text-cyan-300 hover:text-cyan-200"
        >
          {text}
        </a>,
      );
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(line);
  }

  if (lastIndex < line.length) {
    const textPart = line.slice(lastIndex);
    const rendered = renderBoldText(textPart, `post-${lastIndex}`);
    if (Array.isArray(rendered)) parts.push(...rendered);
    else parts.push(rendered);
  }

  return parts.length > 0 ? parts : line;
}

export function AiHelpChatWidget() {
  const [open, setOpen] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      setLoadingConfig(true);
      try {
        const res = await fetch("/api/ai/help-chat/config");
        const json = await res.json();
        if (json.success) {
          setCanAccess(Boolean(json.data?.canAccess));
        }
      } catch {
        setCanAccess(false);
      } finally {
        setLoadingConfig(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!canAccess || !open) return;
    void (async () => {
      try {
        const res = await fetch("/api/ai/help-chat/conversations");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setConversations(json.data);
          setPersistenceEnabled(json.persistenceEnabled !== false);
          if (!activeConversationId && !isNewConversation && json.data.length > 0) {
            setActiveConversationId(json.data[0].id);
          }
        }
      } catch {
        // noop
      }
    })();
  }, [canAccess, open, activeConversationId, isNewConversation]);

  useEffect(() => {
    if (!canAccess || !activeConversationId || !open) return;
    void (async () => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/ai/help-chat/conversations/${activeConversationId}`);
        const json = await res.json();
        if (json.success && json.data?.messages) {
          setMessages((json.data.messages as ChatMessage[]).slice(-MAX_VISIBLE_MESSAGES));
        } else {
          setMessages([]);
        }
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [canAccess, activeConversationId, open]);

  const startNewConversation = () => {
    setActiveConversationId(null);
    setIsNewConversation(true);
    setMessages([]);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const optimisticUser: ChatMessage = {
      id: `tmp-user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const streamingAssistant: ChatMessage = {
      id: `tmp-streaming-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser, streamingAssistant].slice(-MAX_VISIBLE_MESSAGES));
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/ai/help-chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: activeConversationId ?? undefined,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ error: "Error de conexión" }));
        throw new Error(errorJson.error || "No se pudo enviar el mensaje");
      }

      if (!res.body) throw new Error("No se recibió respuesta del servidor");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      let finalConversationId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              if (eventType === "meta") {
                if (data.conversationId) {
                  finalConversationId = data.conversationId;
                  setActiveConversationId(data.conversationId);
                  setIsNewConversation(false);
                }
                setPersistenceEnabled(data.persistenceEnabled !== false);
              } else if (eventType === "token") {
                streamedText += data.token || "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
                    updated[updated.length - 1] = { ...last, content: streamedText };
                  }
                  return updated;
                });
              } else if (eventType === "done") {
                const finalText = data.assistantText || streamedText;
                const msgId = data.assistantMessageId || `done-${Date.now()}`;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.findIndex(
                    (m) => m.role === "assistant" && m.id.startsWith("tmp-streaming-"),
                  );
                  if (lastIdx !== -1) {
                    updated[lastIdx] = {
                      id: msgId,
                      role: "assistant",
                      content: finalText,
                      createdAt: new Date().toISOString(),
                    };
                  }
                  return updated;
                });
              } else if (eventType === "error") {
                throw new Error(data.error || "Error del asistente");
              }
            } catch (parseError) {
              if (eventType === "error") {
                throw parseError;
              }
              // ignore non-critical parse errors
            }
            eventType = "";
          }
        }
      }

      // Refresh conversation list
      const listRes = await fetch("/api/ai/help-chat/conversations");
      const listJson = await listRes.json();
      if (listJson.success && Array.isArray(listJson.data)) {
        setConversations(listJson.data);
        setPersistenceEnabled(listJson.persistenceEnabled !== false);
      }
    } catch (error) {
      setMessages((prev) => {
        // Remove the streaming placeholder if it exists
        const filtered = prev.filter(
          (m) => !(m.role === "assistant" && m.id.startsWith("tmp-streaming-") && !m.content),
        );
        return [
          ...filtered,
          {
            id: `tmp-error-${Date.now()}`,
            role: "assistant",
            content: (error as Error).message || "Ocurrió un error al responder. Intenta nuevamente.",
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } finally {
      setSending(false);
    }
  };

  if (loadingConfig || !canAccess) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 md:right-6 z-40 h-12 w-12 rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-indigo-500 text-slate-950 shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition-transform hover:scale-[1.05] bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] md:bottom-6"
        aria-label="Abrir asistente IA"
      >
        <MessageCircle className="mx-auto h-5 w-5" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Desktop: panel anclado abajo derecha */}
          <div className="hidden md:flex fixed right-6 bottom-24 z-50 h-[68vh] max-h-[680px] w-[420px] flex-col rounded-2xl border border-cyan-500/20 bg-background/95 backdrop-blur shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-gradient-to-r from-cyan-500/10 via-emerald-500/5 to-indigo-500/10">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Bot className="h-4 w-4 text-cyan-400" />
                Asistente IA
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Cerrar asistente IA"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={startNewConversation}>
                  <Plus className="h-3.5 w-3.5" />
                  Nueva
                </Button>
                <select
                  className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                  value={activeConversationId ?? ""}
                  onChange={(e) => {
                    setActiveConversationId(e.target.value || null);
                    setIsNewConversation(false);
                  }}
                  disabled={!persistenceEnabled}
                >
                  <option value="">Conversación nueva</option>
                  {conversations.map((conv) => (
                    <option key={conv.id} value={conv.id}>
                      {conv.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Pregúntame cómo usar la aplicación o consulta datos operativos de guardias y métricas.
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      msg.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {renderMessageContent(msg.content)}
                  </div>
                ))
              )}
              {sending && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Escribiendo...</span>
                </div>
              )}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Escribe tu pregunta..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void sendMessage()}
                  disabled={sending || !input.trim()}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile: full-screen */}
            <div className="md:hidden fixed inset-0 z-50 bg-background flex flex-col">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 bg-gradient-to-r from-cyan-500/10 via-emerald-500/5 to-indigo-500/10">
              <div className="flex items-center gap-2 text-base font-semibold">
                  <Bot className="h-4 w-4 text-cyan-400" />
                Asistente IA
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Cerrar asistente IA"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={startNewConversation}>
                  <Plus className="h-3.5 w-3.5" />
                  Nueva
                </Button>
                <select
                  className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                  value={activeConversationId ?? ""}
                  onChange={(e) => {
                    setActiveConversationId(e.target.value || null);
                    setIsNewConversation(false);
                  }}
                  disabled={!persistenceEnabled}
                >
                  <option value="">Conversación nueva</option>
                  {conversations.map((conv) => (
                    <option key={conv.id} value={conv.id}>
                      {conv.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Pregúntame cómo usar la aplicación o consulta datos operativos de guardias y métricas.
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      msg.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {renderMessageContent(msg.content)}
                  </div>
                ))
              )}
              {sending && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Escribiendo...</span>
                </div>
              )}
            </div>

            <div className="border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Escribe tu pregunta..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void sendMessage()}
                  disabled={sending || !input.trim()}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
