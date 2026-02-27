"use client";

import { NotesPanel } from "@/components/notes";
import type { NoteEntityType } from "@/types/notes";

interface NotesSectionProps {
  entityType: NoteEntityType;
  entityId: string;
  currentUserId: string;
}

/**
 * Backward-compatible wrapper around NotesPanel.
 * All new consumers should import NotesPanel from @/components/notes directly.
 */
export function NotesSection({ entityType, entityId, currentUserId }: NotesSectionProps) {
  return (
    <NotesPanel
      entityType={entityType}
      entityId={entityId}
      currentUserId={currentUserId}
    />
  );
}
