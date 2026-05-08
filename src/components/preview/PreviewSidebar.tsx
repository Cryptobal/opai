"use client";

/**
 * Sidebar mínima en preview de borrador webhook.
 */

export function PreviewSidebar(props: {
  sessionId: string;
  zohoData: Record<string, unknown>;
}) {
  return (
    <aside className="fixed right-4 top-24 z-40 hidden max-w-xs rounded-lg border border-white/15 bg-black/40 p-3 text-xs text-white/80 xl:block">
      <div className="font-mono text-[11px] text-white/50">Sesión</div>
      <div className="break-all">{props.sessionId}</div>
    </aside>
  );
}
