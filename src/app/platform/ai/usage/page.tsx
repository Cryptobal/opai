import { AiUsageClient } from "@/components/platform/ai-usage/AiUsageClient";
import { PlatformAiNav } from "@/components/platform/ai-actions/PlatformAiNav";

export default function PlatformAiUsagePage() {
  return (
    <>
      <div className="mb-4"><PlatformAiNav /></div>
      <AiUsageClient />
    </>
  );
}
