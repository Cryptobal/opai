"use client";

import { LogIn, LogOut, Shield, Settings, Users, Bell } from "lucide-react";
import type { ChatMessageData } from "@/lib/chat-types";

interface ChatMessageSystemProps {
  message: ChatMessageData;
}

/**
 * Returns an icon component based on the system event type.
 */
function getSystemIcon(eventType: string | null) {
  switch (eventType) {
    case "member_joined":
      return LogIn;
    case "member_left":
      return LogOut;
    case "channel_created":
      return Users;
    case "role_changed":
      return Shield;
    case "settings_changed":
      return Settings;
    case "notification":
      return Bell;
    default:
      return Settings;
  }
}

/**
 * System message component.
 * Displayed centered with a subtle, italic style and an event-specific icon.
 */
export function ChatMessageSystem({ message }: ChatMessageSystemProps) {
  const Icon = getSystemIcon(message.systemEventType);

  return (
    <div className="flex items-center justify-center gap-2 py-2 my-1 mx-auto max-w-md rounded-md bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] px-3">
      <Icon className="h-3 w-3 text-[rgba(255,255,255,0.28)] shrink-0" />
      <p className="text-xs text-[rgba(255,255,255,0.28)] italic text-center">
        {message.content}
      </p>
    </div>
  );
}
