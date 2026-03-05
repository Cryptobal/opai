import { ChatPage } from "@/components/chat/ChatPage";
import { auth } from "@/lib/auth";

export default async function ChatPageRoute() {
  const session = await auth();
  return <ChatPage currentUserId={session?.user?.id ?? ""} />;
}
