"use client";

import { cn } from "@/lib/utils";

interface ChatTypingIndicatorProps {
  typingUsers: { userId: string; userName: string }[];
}

/**
 * Animated typing indicator that shows who is typing.
 * - Single user: "Juan esta escribiendo..."
 * - Multiple users: "Juan, Maria estan escribiendo..."
 * - Only visible when typingUsers.length > 0
 */
export function ChatTypingIndicator({ typingUsers }: ChatTypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.userName);
  const verb = names.length === 1 ? "esta escribiendo" : "estan escribiendo";
  const text = `${names.join(", ")} ${verb}`;

  return (
    <div className="h-6 flex items-center px-4 shrink-0">
      <div className="flex items-center gap-1.5">
        {/* Animated dots */}
        <span className="flex items-center gap-0.5">
          <span
            className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: "0ms", animationDuration: "1s" }}
          />
          <span
            className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: "150ms", animationDuration: "1s" }}
          />
          <span
            className="h-1 w-1 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: "300ms", animationDuration: "1s" }}
          />
        </span>
        <span className="text-xs text-zinc-400">{text}</span>
      </div>
    </div>
  );
}
