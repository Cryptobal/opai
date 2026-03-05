"use client";

import { useState } from "react";
import { MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatFloatingContext } from "./ChatFloatingProvider";

interface Props {
  contactId: string;
  accountId: string;
  portalEnabled: boolean;
}

export function StartChatButton({ contactId, accountId, portalEnabled }: Props) {
  const ctx = useChatFloatingContext();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!portalEnabled || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/chat/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, contactIds: [contactId] }),
      });
      const json = await res.json();
      if (json.success) {
        ctx.openPanel();
        ctx.selectChannel(json.data.channelId);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={!portalEnabled || loading}
      title={!portalEnabled ? "El contacto no tiene portal activo" : "Iniciar chat externo"}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <MessageCircle className="h-4 w-4 mr-1.5" />
      )}
      Chat
    </Button>
  );
}
