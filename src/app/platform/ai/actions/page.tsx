import { AiActionsClient } from "@/components/platform/ai-actions/AiActionsClient";
import { PlatformAiNav } from "@/components/platform/ai-actions/PlatformAiNav";

export default function PlatformAiActionsPage() {
  return (
    <>
      <div className="mb-4"><PlatformAiNav /></div>
      <AiActionsClient />
    </>
  );
}
