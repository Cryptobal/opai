"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useChatPageContext,
  useClearChatPageContext,
} from "../ChatPageContextProvider";
import { useSpeechDictation } from "@/hooks/useSpeechDictation";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useServerTranscription } from "@/hooks/useServerTranscription";
import { isSpeechDictationSupported } from "@/hooks/useSpeechDictation";
import { shouldForceServerDictation } from "@/lib/mic-permission";
import { getQuickStarters } from "./quick-starters";
import { friendlyToolLabel, resolveNavigationTarget } from "./message-render";
import type { ChatMessage, HistoryConversation } from "./types";
import { MAX_VISIBLE_MESSAGES } from "./types";
import type { VisualBlock, VisualCardItem, VisualSuggestionItem } from "@/lib/ai/help-chat-visual-types";
import type { PendingConfirmationClient } from "./PendingConfirmCards";
import { startNavProgress } from "../nav-progress-bus";
import { pageContextFromCorreoUrl } from "@/lib/ai/help-chat-correo-url-context";
import { isTransientNetworkError } from "@/lib/ai/help-chat-network-error";
import type { ChatPageContextValue } from "../ChatPageContextProvider";
import type { AiOpenAnchoredDetail } from "@/lib/ai/ai-command-event";

const POLISH_KEY = "opai-dictado-pulido";
const MOTOR_KEY = "opai-dictado-motor";
const TRANSCRIBE_UNAVAILABLE_KEY = "opai-transcribe-unavailable";

const BACKGROUND_WAIT_COPY =
  "Sigo pensando en segundo plano… Al volver a la app traeré la respuesta.";

function readSessionFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    // noop
  }
}

function readLocalFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

function readMotor(): "auto" | "server" {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(MOTOR_KEY);
  return v === "server" ? "server" : "auto";
}

async function polishText(text: string): Promise<string> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/ai/help-chat/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(t);
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { text?: string };
    };
    if (json.success && json.data?.text) return json.data.text;
  } catch {
    // fallback original
  }
  return text;
}

export function useHelpChatController(opts: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { open, setOpen } = opts;
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [conversations, setConversations] = useState<HistoryConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<{
    type: string;
    id: string;
    name: string;
  } | null>(null);
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState("");
  const [reasoningSteps, setReasoningSteps] = useState(0);
  const [reasoningMs, setReasoningMs] = useState<number | undefined>(undefined);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [staging, setStaging] = useState(false);
  const [polishEnabled, setPolishEnabled] = useState(false);
  const [motor, setMotor] = useState<"auto" | "server">("auto");
  const [voiceMode, setVoiceMode] = useState(false);
  const [serverTxUnavailable, setServerTxUnavailable] = useState(false);
  const fallbackToastShownRef = useRef(false);

  const registeredPageContext = useChatPageContext();
  const clearPageContext = useClearChatPageContext();
  const pathname = usePathname();
  const router = useRouter();

  // Fallback: si Correos tiene ?thread=/?hilo= pero el provider aún no
  // registró el hilo (race / hilo fuera de la página de lista), sintetizar
  // contexto mínimo al leer la URL. El registro reactivo de CorreosClient
  // manda cuando está disponible.
  const pageContext = useMemo<ChatPageContextValue | null>(() => {
    if (registeredPageContext) return registeredPageContext;
    if (typeof window === "undefined") return null;
    return pageContextFromCorreoUrl(pathname, window.location.search);
  }, [registeredPageContext, pathname]);

  const quickStarters = useMemo(
    () => getQuickStarters(pageContext, pathname),
    [pageContext, pathname],
  );

  const skipMessageFetchRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reasoningTextRef = useRef("");
  const reasoningStepsRef = useRef(0);
  const reasoningStartRef = useRef<number | null>(null);
  /** Polling tras corte de red (background iPad): espera el assistant persistido. */
  const backgroundWaitRef = useRef<{
    conversationId: string;
    sinceIso: string;
  } | null>(null);

  useEffect(() => {
    setPolishEnabled(readLocalFlag(POLISH_KEY, false));
    setMotor(readMotor());
    setServerTxUnavailable(readSessionFlag(TRANSCRIBE_UNAVAILABLE_KEY));
  }, []);

  const navigateInternal = useCallback(
    (path: string) => {
      startNavProgress();
      setOpen(false);
      router.push(path);
    },
    [router, setOpen],
  );

  const sendMessageRef = useRef<(override?: string) => Promise<void>>(async () => {});

  const webSpeech = useSpeechDictation({
    value: input,
    onChange: setInput,
    onSubmit: () => sendMessageRef.current(),
    disabled: sending || staging,
  });

  const serverTx = useServerTranscription({
    onText: (text) => {
      setInput((prev) => {
        const base = prev.trimEnd();
        return [base, text].filter(Boolean).join(base ? " " : "");
      });
      setVoiceMode(false);
    },
  });

  // iOS: Web Speech re-pide mic al abrir/usar dictado; motor servidor = 1 prompt.
  // Si el servidor declaró NO_TRANSCRIPTION_PROVIDER y hay Web Speech, degradamos.
  const preferServer =
    (motor === "server" ||
      !webSpeech.supported ||
      shouldForceServerDictation()) &&
    !(serverTxUnavailable && webSpeech.supported);
  const dictationActive =
    preferServer
      ? serverTx.recording || serverTx.uploading
      : webSpeech.listening;
  // Solo medir nivel mientras hay stream vivo (recording). No durante upload:
  // eso re-pedía mic fuera del gesto del usuario (segundo getUserMedia).
  const levelActive = preferServer && serverTx.recording;
  const levelRef = useAudioLevel(levelActive, serverTx.mediaStream);

  useEffect(() => {
    if (webSpeech.error) toast.error(webSpeech.error);
  }, [webSpeech.error]);

  useEffect(() => {
    if (serverTx.errorCode !== "NO_TRANSCRIPTION_PROVIDER") return;
    setServerTxUnavailable(true);
    writeSessionFlag(TRANSCRIBE_UNAVAILABLE_KEY, true);
    setVoiceMode(false);
    if (webSpeech.supported) {
      if (!fallbackToastShownRef.current) {
        fallbackToastShownRef.current = true;
        toast.info("Dictado del dispositivo activado");
      }
    } else if (!fallbackToastShownRef.current) {
      // Capacitor / WKWebView sin Web Speech: mensaje neutro, sin nombres de proveedor.
      fallbackToastShownRef.current = true;
      toast.error("Dictado no disponible en este dispositivo. Escribe tu mensaje.");
    }
  }, [serverTx.errorCode, webSpeech.supported]);

  useEffect(() => {
    if (serverTx.errorCode === "NO_TRANSCRIPTION_PROVIDER") return;
    if (serverTx.error) toast.error(serverTx.error);
  }, [serverTx.error, serverTx.errorCode]);

  useEffect(() => {
    const run = () => {
      void (async () => {
        setLoadingConfig(true);
        try {
          const res = await fetch("/api/ai/help-chat/config");
          const text = await res.text();
          let json: { success?: boolean; data?: { canAccess?: boolean } };
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            setCanAccess(false);
            return;
          }
          if (json.success) setCanAccess(Boolean(json.data?.canAccess));
        } catch {
          setCanAccess(false);
        } finally {
          setLoadingConfig(false);
        }
      })();
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) {
      const id = ric(run, { timeout: 1200 });
      return () => {
        const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        cancel?.(id);
      };
    }
    const t = window.setTimeout(run, 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!canAccess || !open) return;
    void (async () => {
      try {
        const res = await fetch("/api/ai/help-chat/conversations");
        const text = await res.text();
        let json: { success?: boolean; data?: HistoryConversation[]; persistenceEnabled?: boolean };
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          return;
        }
        if (json.success && Array.isArray(json.data)) {
          setConversations(json.data);
          setPersistenceEnabled(json.persistenceEnabled !== false);
          if (!activeConversationId && !isNewConversation) {
            setIsNewConversation(true);
            setMessages([]);
          }
        }
      } catch {
        // noop
      }
    })();
  }, [canAccess, open, activeConversationId, isNewConversation]);

  useEffect(() => {
    if (!canAccess || !activeConversationId || !open) return;
    if (skipMessageFetchRef.current === activeConversationId) {
      skipMessageFetchRef.current = null;
      return;
    }
    void (async () => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/ai/help-chat/conversations/${activeConversationId}`);
        const text = await res.text();
        let json: { success?: boolean; data?: { messages?: ChatMessage[] } };
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          setMessages([]);
          return;
        }
        if (json.success && json.data?.messages) {
          setMessages((json.data.messages as ChatMessage[]).slice(-MAX_VISIBLE_MESSAGES));
        } else setMessages([]);
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [canAccess, activeConversationId, open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setIsNewConversation(true);
    setMessages([]);
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/help-chat/conversations");
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: HistoryConversation[];
        persistenceEnabled?: boolean;
      };
      if (json.success && Array.isArray(json.data)) {
        setConversations(json.data);
        setPersistenceEnabled(json.persistenceEnabled !== false);
      }
    } catch {
      // noop
    }
  }, []);

  const hydrateConversationMessages = useCallback(
    async (conversationId: string): Promise<ChatMessage[] | null> => {
      try {
        const res = await fetch(`/api/ai/help-chat/conversations/${conversationId}`);
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { messages?: ChatMessage[] };
        };
        if (!json.success || !Array.isArray(json.data?.messages)) return null;
        return json.data.messages as ChatMessage[];
      } catch {
        return null;
      }
    },
    [],
  );

  const openAnchored = useCallback(
    async (detail: AiOpenAnchoredDetail) => {
      setActiveAnchor({ type: detail.anchorType, id: detail.anchorId, name: detail.entityName });
      setOpen(true);
      try {
        const res = await fetch("/api/ai/conversations/anchored", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: detail.anchorType,
            id: detail.anchorId,
            entityName: detail.entityName,
            createNew: Boolean(detail.createNew),
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          conversation?: { id: string; title?: string };
          error?: string;
        };
        if (!res.ok || !json.conversation?.id) {
          toast.error(json.error || "No se pudo abrir el chat anclado");
          return;
        }
        skipMessageFetchRef.current = json.conversation.id;
        setActiveConversationId(json.conversation.id);
        setIsNewConversation(false);
        const msgs = await hydrateConversationMessages(json.conversation.id);
        setMessages(msgs ?? []);
        void refreshConversations();
      } catch {
        toast.error("No se pudo abrir el chat anclado");
      }
    },
    [hydrateConversationMessages, refreshConversations, setOpen],
  );

  const startNewAnchored = useCallback(() => {
    if (!activeAnchor) {
      startNewConversation();
      return;
    }
    void openAnchored({
      anchorType: activeAnchor.type as AiOpenAnchoredDetail["anchorType"],
      anchorId: activeAnchor.id,
      entityName: activeAnchor.name,
      createNew: true,
    });
  }, [activeAnchor, openAnchored, startNewConversation]);

  const clearReasoningLive = useCallback(() => {
    reasoningTextRef.current = "";
    reasoningStepsRef.current = 0;
    reasoningStartRef.current = null;
    setReasoningText("");
    setReasoningSteps(0);
    setReasoningMs(undefined);
  }, []);

  /**
   * Si el SSE se cortó al ir a background, el servidor igual persiste el
   * assistant. Relee el hilo y reemplaza el placeholder cuando aparece.
   */
  const tryRecoverBackgroundReply = useCallback(async (): Promise<boolean> => {
    const wait = backgroundWaitRef.current;
    if (!wait) return false;
    const msgs = await hydrateConversationMessages(wait.conversationId);
    if (!msgs) return false;
    const since = Date.parse(wait.sinceIso);
    const assistant = [...msgs]
      .reverse()
      .find(
        (m) =>
          m.role === "assistant" &&
          !m.id.startsWith("tmp-") &&
          Date.parse(m.createdAt) >= since - 2000,
      );
    if (!assistant) return false;
    backgroundWaitRef.current = null;
    skipMessageFetchRef.current = wait.conversationId;
    setActiveConversationId(wait.conversationId);
    setIsNewConversation(false);
    setMessages(msgs.slice(-MAX_VISIBLE_MESSAGES));
    setSending(false);
    setStreamingStarted(false);
    setActiveToolName(null);
    clearReasoningLive();
    void refreshConversations();
    return true;
  }, [hydrateConversationMessages, refreshConversations, clearReasoningLive]);

  const stopStreaming = useCallback(() => {
    backgroundWaitRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setActiveToolName(null);
    webSpeech.cancel();
    serverTx.cancel();
    setVoiceMode(false);
  }, [webSpeech, serverTx]);

  // Rehidratar respuesta si el SSE murió al ir a otra app (iPad/Safari).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (cancelled || !backgroundWaitRef.current) return;
      void tryRecoverBackgroundReply().then((ok) => {
        if (ok && timer) {
          clearInterval(timer);
          timer = null;
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };

    timer = setInterval(tick, 2500);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    tick();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [open, tryRecoverBackgroundReply]);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setPendingFiles((prev) => {
      const merged = [...prev];
      for (const f of Array.from(list)) {
        if (merged.length >= 4) {
          toast.error("Máximo 4 archivos por mensaje.");
          break;
        }
        if (f.size > 10_000_000) {
          toast.error(`${f.name} supera 10MB.`);
          continue;
        }
        if (merged.some((m) => m.name === f.name && m.size === f.size)) continue;
        merged.push(f);
      }
      return merged;
    });
  }, []);

  const removeFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const typed = (overrideText ?? input).trim();
      const text =
        typed || (pendingFiles.length > 0 ? "Revisa el archivo adjunto y dime qué contiene." : "");
      if (!text || sending || staging) return;

      let attachmentRefs: Array<{
        stagedKey: string;
        fileName: string;
        mimeType: string;
        size: number;
      }> = [];
      const filesToSend = pendingFiles;
      if (filesToSend.length > 0) {
        setStaging(true);
        try {
          const fd = new FormData();
          for (const f of filesToSend) fd.append("files", f);
          const upRes = await fetch("/api/ai/help-chat/attachments", { method: "POST", body: fd });
          const upJson = (await upRes.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            attachments?: Array<{
              stagedKey: string;
              fileName: string;
              mimeType: string;
              size: number;
            }>;
          };
          if (!upRes.ok || !upJson?.ok || !upJson.attachments?.length) {
            throw new Error(upJson?.error || "No se pudo subir el archivo");
          }
          attachmentRefs = upJson.attachments;
        } catch (err) {
          setStaging(false);
          toast.error(err instanceof Error ? err.message : "No se pudo subir el archivo");
          return;
        }
        setStaging(false);
        setPendingFiles([]);
      }

      setStreamingStarted(false);
      clearReasoningLive();
      reasoningStartRef.current = Date.now();
      webSpeech.cancel();
      serverTx.cancel();
      setVoiceMode(false);

      const optimisticUser: ChatMessage = {
        id: `tmp-user-${Date.now()}`,
        role: "user",
        content:
          attachmentRefs.length > 0
            ? `${text}\n\n📎 ${attachmentRefs.map((a) => a.fileName).join(", ")}`
            : text,
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

      const controller = new AbortController();
      abortRef.current = controller;
      backgroundWaitRef.current = null;
      const turnStartedAt = new Date().toISOString();
      let streamConversationId = activeConversationId;

      try {
        const res = await fetch("/api/ai/help-chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            conversationId: activeConversationId ?? undefined,
            // Releer URL al enviar: pushState de Correos puede haber abierto
            // un hilo después del último render del memo.
            pageContext:
              (pageContext ??
                pageContextFromCorreoUrl(
                  pathname,
                  typeof window !== "undefined" ? window.location.search : "",
                )) ??
              undefined,
            pathname: pathname ?? undefined,
            attachments: attachmentRefs.length > 0 ? attachmentRefs : undefined,
          }),
        });

        const headerConvId = res.headers.get("X-Opai-Conversation-Id");
        if (headerConvId) {
          streamConversationId = headerConvId;
          if (headerConvId !== activeConversationId) {
            skipMessageFetchRef.current = headerConvId;
          }
          setActiveConversationId(headerConvId);
          setIsNewConversation(false);
        }

        if (!res.ok) {
          const errText = await res.text();
          let errorJson: { error?: string };
          try {
            errorJson = errText ? JSON.parse(errText) : {};
          } catch {
            errorJson = { error: "Error de conexión" };
          }
          throw new Error(errorJson.error || "No se pudo enviar el mensaje");
        }
        if (!res.body) throw new Error("No se recibió respuesta del servidor");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedText = "";
        let completed = false;

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
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (eventType === "meta") {
                if (data.conversationId) {
                  const newId = String(data.conversationId);
                  streamConversationId = newId;
                  if (newId !== activeConversationId) skipMessageFetchRef.current = newId;
                  setActiveConversationId(newId);
                  setIsNewConversation(false);
                }
                setPersistenceEnabled(data.persistenceEnabled !== false);
              } else if (eventType === "token") {
                if (!streamingStarted) setStreamingStarted(true);
                streamedText += (data.token as string) || "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
                    updated[updated.length - 1] = { ...last, content: streamedText };
                  }
                  return updated;
                });
              } else if (eventType === "done") {
                completed = true;
                backgroundWaitRef.current = null;
                const finalText = (data.assistantText as string) || streamedText;
                const visuals = (data.visuals as VisualBlock[] | undefined) ?? [];
                const suggestions = (data.suggestions as VisualSuggestionItem[] | undefined) ?? [];
                const pendingConfirmations =
                  (data.pendingConfirmations as PendingConfirmationClient[] | undefined) ?? [];
                const msgId = (data.assistantMessageId as string) || `done-${Date.now()}`;
                const doneReasoning =
                  (data.reasoning as string) || reasoningTextRef.current || undefined;
                const doneReasoningMs =
                  typeof data.reasoningMs === "number"
                    ? (data.reasoningMs as number)
                    : doneReasoning && reasoningStartRef.current
                      ? Date.now() - reasoningStartRef.current
                      : undefined;
                if (doneReasoningMs != null) setReasoningMs(doneReasoningMs);
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
                      visuals,
                      suggestions,
                      pendingConfirmations,
                      reasoning: doneReasoning,
                      reasoningMs: doneReasoningMs,
                      createdAt: new Date().toISOString(),
                    };
                  }
                  return updated;
                });
              } else if (eventType === "tool_call") {
                const status = (data.status as string) || "running";
                const name = (data.name as string) || "";
                setActiveToolName(status === "running" ? name : null);
              } else if (eventType === "stash_reasoning") {
                const chunk = ((data.text as string) || "").trim();
                if (chunk) {
                  const next = reasoningTextRef.current
                    ? `${reasoningTextRef.current}\n\n${chunk}`
                    : chunk;
                  reasoningTextRef.current = next;
                  setReasoningText(next);
                }
                reasoningStepsRef.current += 1;
                setReasoningSteps(reasoningStepsRef.current);
                streamedText = "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
                    updated[updated.length - 1] = { ...last, content: "" };
                  }
                  return updated;
                });
              } else if (eventType === "reset_stream") {
                streamedText = "";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
                    updated[updated.length - 1] = { ...last, content: "" };
                  }
                  return updated;
                });
              } else if (eventType === "error") {
                throw new Error((data.error as string) || "Error del asistente");
              }
            } catch (parseError) {
              if (eventType === "error") throw parseError;
            }
            eventType = "";
          }
        }
        // Stream cerrado sin "done": típico al ir a background en iPad.
        if (!completed && streamConversationId && persistenceEnabled) {
          backgroundWaitRef.current = {
            conversationId: streamConversationId,
            sinceIso: turnStartedAt,
          };
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content?.trim()
                  ? `${last.content}\n\n_${BACKGROUND_WAIT_COPY}_`
                  : `_${BACKGROUND_WAIT_COPY}_`,
              };
            }
            return updated;
          });
          void tryRecoverBackgroundReply();
        } else {
          await refreshConversations();
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          backgroundWaitRef.current = null;
          const abortedReasoning = reasoningTextRef.current || undefined;
          const abortedMs =
            abortedReasoning && reasoningStartRef.current
              ? Date.now() - reasoningStartRef.current
              : undefined;
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
              updated[updated.length - 1] = {
                ...last,
                id: `stopped-${Date.now()}`,
                content: last.content?.trim()
                  ? `${last.content}\n\n_(respuesta detenida)_`
                  : "_(respuesta detenida)_",
                reasoning: abortedReasoning,
                reasoningMs: abortedMs,
              };
            }
            return updated;
          });
        } else if (
          isTransientNetworkError(error) &&
          streamConversationId &&
          persistenceEnabled
        ) {
          // Safari: "Load failed" al suspender la app. El servidor sigue y persiste.
          backgroundWaitRef.current = {
            conversationId: streamConversationId,
            sinceIso: turnStartedAt,
          };
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant" && last.id.startsWith("tmp-streaming-")) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content?.trim()
                  ? `${last.content}\n\n_${BACKGROUND_WAIT_COPY}_`
                  : `_${BACKGROUND_WAIT_COPY}_`,
              };
            }
            return updated;
          });
          void tryRecoverBackgroundReply();
        } else {
          backgroundWaitRef.current = null;
          setMessages((prev) => {
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
        }
      } finally {
        abortRef.current = null;
        // Si esperamos respuesta en background, mantenemos "sending" visual
        // vía el placeholder; el flag sending se baja para no bloquear UI.
        setSending(false);
        setActiveToolName(null);
        clearReasoningLive();
      }
    },
    [
      input,
      pendingFiles,
      sending,
      staging,
      webSpeech,
      serverTx,
      activeConversationId,
      pageContext,
      pathname,
      streamingStarted,
      persistenceEnabled,
      refreshConversations,
      clearReasoningLive,
      tryRecoverBackgroundReply,
    ],
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const regenerateLast = useCallback(() => {
    if (sending) return;
    let lastUser = "";
    const next = [...messages];
    while (next.length) {
      const last = next[next.length - 1];
      if (last.role === "assistant") {
        next.pop();
        continue;
      }
      if (last.role === "user") {
        lastUser = last.content.replace(/\n\n📎 .+$/, "").trim();
        next.pop();
        break;
      }
      break;
    }
    if (!lastUser) {
      toast.error("No hay un mensaje para regenerar");
      return;
    }
    setMessages(next);
    void sendMessage(lastUser);
  }, [sending, messages, sendMessage]);

  const handleAction = useCallback(
    (action: VisualCardItem["action"] | VisualSuggestionItem["action"] | undefined) => {
      if (!action) return;
      if (action.type === "navigate") {
        const target = resolveNavigationTarget(action.url);
        if (target.kind === "internal") {
          navigateInternal(target.path);
          return;
        }
        window.open(target.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (action.type === "query") void sendMessage(action.message);
    },
    [navigateInternal, sendMessage],
  );

  const applyPolishIfNeeded = useCallback(
    async (text: string) => {
      if (!polishEnabled || !text.trim()) return text;
      return polishText(text);
    },
    [polishEnabled],
  );

  const startDictation = useCallback(() => {
    setVoiceMode(true);
    if (preferServer) void serverTx.start();
    else webSpeech.start();
  }, [preferServer, serverTx, webSpeech]);

  const cancelDictation = useCallback(() => {
    if (preferServer) serverTx.cancel();
    else webSpeech.cancel();
    setVoiceMode(false);
  }, [preferServer, serverTx, webSpeech]);

  const finishDictation = useCallback(async () => {
    if (preferServer) {
      serverTx.stop();
      // texto llega por onText
    } else {
      const text = await webSpeech.finish();
      const polished = await applyPolishIfNeeded(text);
      if (polished !== text) setInput(polished);
      setVoiceMode(false);
    }
  }, [preferServer, serverTx, webSpeech, applyPolishIfNeeded]);

  const finishAndSendDictation = useCallback(async () => {
    if (preferServer) {
      // Esperar upload: usamos finish del web path no aplica.
      // Detener y al recibir texto, enviar — simplificado: stop y send actual input tras breve espera.
      serverTx.stop();
      setTimeout(() => {
        void sendMessageRef.current();
        setVoiceMode(false);
      }, 800);
    } else {
      await webSpeech.finish();
      const polished = await applyPolishIfNeeded(input);
      if (polished !== input) setInput(polished);
      setVoiceMode(false);
      await sendMessageRef.current(polished);
    }
  }, [preferServer, serverTx, webSpeech, applyPolishIfNeeded, input]);

  const dictationSupported =
    preferServer
      ? serverTx.supported
      : webSpeech.supported || (typeof MediaRecorder !== "undefined");

  // Si Web Speech no existe, permitir servidor; si tampoco MediaRecorder, false.
  const micAvailable =
    isSpeechDictationSupported() ||
    (typeof window !== "undefined" && typeof MediaRecorder !== "undefined");

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const threadTitle = activeConv?.title ?? "Conversación nueva";

  const setPolish = useCallback((v: boolean) => {
    setPolishEnabled(v);
    try {
      localStorage.setItem(POLISH_KEY, v ? "1" : "0");
    } catch {
      // noop
    }
  }, []);

  return {
    loadingConfig,
    canAccess,
    open,
    setOpen,
    messages,
    loadingMessages,
    sending,
    streamingStarted,
    activeToolName,
    reasoningText,
    reasoningSteps,
    reasoningMs,
    quickStarters,
    persistenceEnabled,
    pageContext,
    clearPageContext,
    conversations,
    activeConversationId,
    scrollRef,
    threadTitle,
    input,
    setInput,
    pendingFiles,
    staging,
    polishEnabled,
    setPolish,
    voiceMode,
    dictationActive: voiceMode && dictationActive,
    dictationSupported: micAvailable,
    levelRef,
    elapsedMs: preferServer ? serverTx.elapsedMs : webSpeech.elapsedMs,
    silent: preferServer ? false : webSpeech.silent,
    confirmedText: preferServer ? "" : webSpeech.finalText,
    interimText: preferServer ? "" : webSpeech.interimText,
    startDictation,
    cancelDictation,
    finishDictation,
    finishAndSendDictation,
    startNewConversation,
    startNewAnchored,
    openAnchored,
    activeAnchor,
    refreshConversations,
    setActiveConversationId,
    setIsNewConversation,
    setMessages,
    stopStreaming,
    sendMessage,
    regenerateLast,
    handleAction,
    navigateInternal,
    addFiles,
    removeFile,
    friendlyToolLabel,
    setMotor,
    motor,
  };
}
