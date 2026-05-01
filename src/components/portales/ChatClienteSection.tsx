"use client";

import React, { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { Send, Paperclip, Loader2, ArrowLeft, X, Image as ImageIcon, File as FileIcon, Lock, Shield, Users, DollarSign, Building2 } from "lucide-react";
import type { ChatMessageData, ChatAttachment } from "@/lib/chat-types";
import { ChatSlackMessage } from "@/components/chat/ChatSlackMessage";
import { ChatDateDivider } from "@/components/chat/ChatDateDivider";
import Pusher from "pusher-js";

interface ClienteSession {
  contactId: string;
  tenantId: string;
  accountId: string;
  accountName: string;
  firstName: string;
  lastName?: string;
  installations: Array<{ id: string; name: string }>;
}

interface ChannelInfo {
  id: string;
  name: string;
  installationId: string | null;
  groupId?: string | null;
  channelType?: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  notificationPreference?: "ALL" | "MENTIONS_ONLY" | "MUTED";
}

interface LockedChannel {
  icon: string;
  name: string;
  desc: string;
  locked: boolean;
}

interface ChatClienteSectionProps {
  session: ClienteSession;
  isProspect?: boolean;
}

const LOCKED_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  Users,
  DollarSign,
  Building2,
};

function lockedChannelIcon(iconName: string) {
  return LOCKED_ICON_MAP[iconName] ?? Shield;
}

// ── Grouping helpers ──

function computeIsFirstInGroup(messages: { senderId: string; createdAt: string }[], index: number): boolean {
  if (index === 0) return true;
  const prev = messages[index - 1];
  const curr = messages[index];
  if (prev.senderId !== curr.senderId) return true;
  return (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) > 5 * 60 * 1000;
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((today.getTime() - msgDate.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]}`;
}

export function ChatClienteSection({ session, isProspect }: ChatClienteSectionProps) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [groupChannels, setGroupChannels] = useState<ChannelInfo[]>([]);
  const [lockedChannels, setLockedChannels] = useState<LockedChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<ChannelInfo | null>(null);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);

  const senderName = session.lastName
    ? `${session.firstName} ${session.lastName}`
    : session.firstName;

  const headers: Record<string, string> = {
    "x-contact-id": session.contactId,
    "x-tenant-id": session.tenantId,
    "x-account-id": session.accountId,
    "x-contact-name": encodeURIComponent(senderName),
    "Content-Type": "application/json",
  };

  // Load installation channels + group channels in parallel
  useEffect(() => {
    setIsLoadingChannels(true);
    Promise.all([
      fetch("/api/portal/cliente/chat/channels", { headers }).then((r) => r.json()),
      fetch("/api/portal/cliente/chat/groups", { headers }).then((r) => r.json()),
    ])
      .then(([installRes, groupRes]) => {
        const instChannels: ChannelInfo[] = installRes.success ? installRes.data ?? [] : [];
        const grpChannels: ChannelInfo[] = groupRes.success ? groupRes.data ?? [] : [];
        const locked: LockedChannel[] = installRes.lockedChannels ?? [];
        setChannels(instChannels);
        setGroupChannels(grpChannels);
        setLockedChannels(locked);
        // Auto-select if there is exactly one installation channel and no groups (and no locked channels)
        if (instChannels.length === 1 && grpChannels.length === 0 && locked.length === 0) {
          setSelectedChannel(instChannels[0]);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingChannels(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allChannels = [...channels, ...groupChannels];

  if (isLoadingChannels) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (allChannels.length === 0 && lockedChannels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <p className="text-zinc-400 text-sm">No hay canales de chat disponibles.</p>
      </div>
    );
  }

  // If a channel is selected, show conversation
  if (selectedChannel) {
    return (
      <ClienteChatConversation
        session={session}
        channel={selectedChannel}
        senderName={senderName}
        onBack={allChannels.length > 1 ? () => setSelectedChannel(null) : undefined}
      />
    );
  }

  const renderChannelButton = (ch: ChannelInfo) => (
    <button
      key={ch.id}
      onClick={() => setSelectedChannel(ch)}
      className="w-full flex items-center gap-3 px-4 h-14 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left"
    >
      <span className="text-[#2dd4bf] text-base font-bold shrink-0">#</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100 truncate">{ch.name}</p>
        {ch.lastMessagePreview && (
          <p className="text-[11px] text-zinc-500 truncate">{ch.lastMessagePreview}</p>
        )}
      </div>
      {ch.unreadCount > 0 && (ch.notificationPreference ?? "ALL") !== "MUTED" && (
        <span className={`inline-flex items-center justify-center h-5 min-w-[20px] rounded-full text-[10px] font-bold px-1.5 ${
          (ch.notificationPreference ?? "ALL") === "MENTIONS_ONLY"
            ? "bg-zinc-600 text-zinc-300"
            : "bg-[#2dd4bf] text-zinc-900"
        }`}>
          {ch.unreadCount}
        </span>
      )}
    </button>
  );

  // Show channel list
  return (
    <div className="space-y-2">
      {channels.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
            Canales de instalación
          </h3>
          {channels.map(renderChannelButton)}
        </>
      )}

      {groupChannels.length > 0 && (
        <>
          {channels.length > 0 && (
            <div className="border-t border-zinc-800 my-3" />
          )}
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
            Grupos
          </h3>
          {groupChannels.map(renderChannelButton)}
        </>
      )}

      {lockedChannels.length > 0 && (
        <>
          {(channels.length > 0 || groupChannels.length > 0) && (
            <div className="border-t border-zinc-800 my-3" />
          )}
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
            Canales disponibles al activarse
          </h3>
          {lockedChannels.map((lc) => {
            const IconComponent = lockedChannelIcon(lc.icon);
            return (
              <div
                key={lc.name}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
              >
                <div className="h-9 w-9 rounded-full bg-zinc-700/30 flex items-center justify-center shrink-0 relative">
                  <IconComponent className="h-4 w-4 text-zinc-500" />
                  <Lock className="h-2.5 w-2.5 text-zinc-500 absolute -bottom-0.5 -right-0.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-400 truncate">{lc.name}</p>
                  <p className="text-[11px] text-zinc-600 truncate">{lc.desc}</p>
                </div>
                <Lock className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Conversation Component ──

function ClienteChatConversation({
  session,
  channel,
  senderName,
  onBack,
}: {
  session: ClienteSession;
  channel: ChannelInfo;
  senderName: string;
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const headers: Record<string, string> = {
    "x-contact-id": session.contactId,
    "x-tenant-id": session.tenantId,
    "x-account-id": session.accountId,
    "x-contact-name": encodeURIComponent(senderName),
    "Content-Type": "application/json",
  };

  // Load messages
  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/portal/cliente/chat/channels/${channel.id}/messages?limit=50`, { headers })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setMessages(res.data.reverse());
          setHasMore(res.meta?.hasMore ?? false);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to Pusher
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) return;

    const pusher = new Pusher(key, {
      cluster,
      authEndpoint: "/api/portal/cliente/chat/pusher/auth",
      auth: {
        headers: {
          "x-contact-id": session.contactId,
          "x-tenant-id": session.tenantId,
          "x-account-id": session.accountId,
          "x-contact-name": encodeURIComponent(senderName),
        },
      },
    });

    const presenceChannelName = `presence-chat-${channel.id}`;
    const ch = pusher.subscribe(presenceChannelName);

    ch.bind("new-message", (data: ChatMessageData) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 50);
    });

    ch.bind("message-deleted", (data: { id: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.id));
    });

    ch.bind("message-edited", (data: { id: string; content: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, content: data.content, isEdited: true } : m))
      );
    });

    return () => {
      ch.unbind_all();
      pusher.unsubscribe(presenceChannelName);
      pusher.disconnect();
    };
  }, [channel.id, session.contactId, session.tenantId, session.accountId, senderName]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (messages.length > 0 && !loadingMore) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark as read
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    fetch(`/api/portal/cliente/chat/channels/${channel.id}/read`, {
      method: "POST",
      headers,
      body: JSON.stringify({ lastReadMessageId: lastMsg.id }),
    }).catch(() => {});
  }, [channel.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const oldestId = messages[0]?.id;
    const url = `/api/portal/cliente/chat/channels/${channel.id}/messages?limit=50${oldestId ? `&cursor=${oldestId}` : ""}`;
    try {
      const res = await fetch(url, { headers }).then((r) => r.json());
      if (res.success) {
        setMessages((prev) => [...res.data.reverse(), ...prev]);
        setHasMore(res.meta?.hasMore ?? false);
      }
    } catch {}
    setLoadingMore(false);
  }, [hasMore, loadingMore, messages, channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const maxSize = 10 * 1024 * 1024;
    const valid = files.filter((f) => f.size <= maxSize).slice(0, 5 - pendingFiles.length);
    setPendingFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingFiles.length]);

  const removePendingFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addFilesFromList = useCallback(
    (fileList: File[]) => {
      if (fileList.length === 0) return;
      const maxSize = 10 * 1024 * 1024;
      const valid = fileList.filter((f) => f.size <= maxSize).slice(0, 5 - pendingFiles.length);
      if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
    },
    [pendingFiles.length],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const file = items[i].getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        addFilesFromList(pastedFiles);
      }
    },
    [addFilesFromList],
  );

  const uploadFiles = async (files: File[]): Promise<ChatAttachment[]> => {
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    const res = await fetch("/api/portal/cliente/chat/upload", {
      method: "POST",
      headers: {
        "x-contact-id": session.contactId,
        "x-tenant-id": session.tenantId,
        "x-account-id": session.accountId,
        "x-contact-name": encodeURIComponent(senderName),
      },
      body: formData,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data;
  };

  const handleSend = async () => {
    if ((!inputText.trim() && pendingFiles.length === 0) || isSending) return;
    const content = inputText.trim();
    setIsSending(true);
    setInputText("");
    setReplyTo(null);

    try {
      let attachments: ChatAttachment[] | undefined;
      if (pendingFiles.length > 0) {
        setIsUploading(true);
        attachments = await uploadFiles(pendingFiles);
        setIsUploading(false);
        setPendingFiles([]);
      }

      const body: Record<string, unknown> = { content: content || "[Archivo adjunto]" };
      if (replyTo) body.replyToId = replyTo.id;
      if (attachments) body.attachments = attachments;

      const res = await fetch(`/api/portal/cliente/chat/channels/${channel.id}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }).then((r) => r.json());

      if (res.success) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.data.id)) return prev;
          return [...prev, res.data];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 50);
      }
    } catch {}
    setIsSending(false);
    setIsUploading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop < 50 && hasMore && !loadingMore) {
      loadMore();
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        {onBack && (
          <button onClick={onBack} className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="h-8 w-8 rounded-full bg-teal-600/20 flex items-center justify-center">
          <span className="text-status-info-fg text-xs font-bold">#</span>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{channel.name}</h3>
          <p className="text-[10px] text-zinc-500">
            {channel.channelType === "GROUP" ? "Grupo" : "Chat de instalación"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto py-3"
          >
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              </div>
            )}
            {messages.map((msg, idx) => {
              const prevDateKey = idx > 0 ? getDateKey(messages[idx - 1].createdAt) : null;
              const currDateKey = getDateKey(msg.createdAt);
              const showDateDivider = currDateKey !== prevDateKey;
              const isFirst = computeIsFirstInGroup(messages, idx);

              return (
                <React.Fragment key={msg.id || idx}>
                  {showDateDivider && <ChatDateDivider label={formatDateLabel(msg.createdAt)} />}
                  <ChatSlackMessage message={msg} isFirstInGroup={isFirst}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {msg.attachments.map((att, i) => (
                          <a key={i} href={att.fileUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-[#2dd4bf] hover:text-status-info-fg">
                            {att.fileType?.startsWith("image/") ? (
                              <ImageIcon className="h-3 w-3" />
                            ) : (
                              <FileIcon className="h-3 w-3" />
                            )}
                            {att.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </ChatSlackMessage>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply banner */}
          {replyTo && (
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border-t border-zinc-800">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-status-info-fg">Respondiendo a {replyTo.senderName}</p>
                <p className="text-xs text-zinc-400 truncate">{replyTo.content}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* File previews */}
          {pendingFiles.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 overflow-x-auto">
              {pendingFiles.map((file, idx) => (
                <div key={idx} className="relative shrink-0 group">
                  {file.type.startsWith("image/") ? (
                    <div className="h-12 w-12 rounded-lg overflow-hidden border border-zinc-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={URL.createObjectURL(file)} alt={file.name} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50">
                      <FileIcon className="h-4 w-4 text-zinc-400" />
                      <span className="text-[8px] text-zinc-500 truncate max-w-[40px]">
                        {file.name.split(".").pop()?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removePendingFile(idx)}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-status-danger"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[#0d1220]">
            <div className="flex items-end gap-2 bg-[#141a2a] rounded-xl border border-[rgba(255,255,255,0.06)] focus-within:border-[rgba(45,212,191,0.3)] px-2 transition-colors">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingFiles.length >= 5}
                className="h-[38px] w-[38px] shrink-0 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Adjuntar archivo"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              />
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Escribe un mensaje..."
                rows={1}
                className="flex-1 resize-none bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none max-h-28"
                style={{ minHeight: "38px" }}
              />
              <button
                onClick={handleSend}
                disabled={(!inputText.trim() && pendingFiles.length === 0) || isSending}
                className="h-[32px] w-[32px] my-[3px] rounded-lg bg-[#2dd4bf] flex items-center justify-center text-zinc-900 disabled:opacity-40 hover:bg-teal-300 transition-colors shrink-0"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            {isUploading && (
              <p className="text-[10px] text-zinc-500 mt-1 ml-11">Subiendo archivos...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

