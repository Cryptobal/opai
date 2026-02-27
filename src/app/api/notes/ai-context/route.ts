/**
 * API Route: /api/notes/ai-context
 * GET — AI context data for a given entity
 *       contextType=X&contextId=Y
 *       Returns: entity info, relevant notes, decisions, tasks, participants, related entities.
 *       Only PUBLIC notes (excludes private/group).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasModuleAccess } from "@/lib/permissions";
import { isValidContextType, getContextModule, CONTEXT_LABELS, isNotesTableMissing, notesNotAvailableResponse } from "@/lib/note-utils";
import type { NoteContextType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const sp = request.nextUrl.searchParams;
    const contextType = sp.get("contextType") ?? "";
    const contextId = sp.get("contextId") ?? "";

    if (!contextType || !contextId) {
      return NextResponse.json(
        { success: false, error: "contextType y contextId son requeridos" },
        { status: 400 },
      );
    }
    if (!isValidContextType(contextType)) {
      return NextResponse.json(
        { success: false, error: "contextType inválido" },
        { status: 400 },
      );
    }

    // Permission check
    const perms = await resolveApiPerms(ctx);
    const module = getContextModule(contextType as NoteContextType);
    if (!hasModuleAccess(perms, module as any)) {
      return NextResponse.json(
        { success: false, error: `Sin permisos para módulo ${module.toUpperCase()}` },
        { status: 403 },
      );
    }

    // Fetch last 50 public notes that are AI-relevant
    const [notes, decisionNotes, taskNotes, entityRefs, existingSummary] =
      await Promise.all([
        prisma.note.findMany({
          where: {
            tenantId: ctx.tenantId,
            contextType: contextType as NoteContextType,
            contextId,
            visibility: "PUBLIC",
            aiRelevant: true,
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            content: true,
            noteType: true,
            authorId: true,
            createdAt: true,
            aiTags: true,
            aiSentiment: true,
            author: { select: { id: true, name: true } },
          },
        }),
        prisma.note.findMany({
          where: {
            tenantId: ctx.tenantId,
            contextType: contextType as NoteContextType,
            contextId,
            visibility: "PUBLIC",
            noteType: "DECISION",
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        }),
        prisma.note.findMany({
          where: {
            tenantId: ctx.tenantId,
            contextType: contextType as NoteContextType,
            contextId,
            visibility: "PUBLIC",
            noteType: "TASK",
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        }),
        prisma.noteEntityReference.findMany({
          where: {
            tenantId: ctx.tenantId,
            note: {
              contextType: contextType as NoteContextType,
              contextId,
              deletedAt: null,
            },
          },
          select: {
            referencedEntityType: true,
            referencedEntityId: true,
            referencedEntityLabel: true,
            referencedEntityCode: true,
          },
          distinct: ["referencedEntityType", "referencedEntityId"],
          take: 20,
        }),
        prisma.aiContextSummary.findFirst({
          where: {
            tenantId: ctx.tenantId,
            contextType: contextType as NoteContextType,
            contextId,
          },
          orderBy: { periodEnd: "desc" },
        }),
      ]);

    // Extract unique participants
    const participantMap = new Map<string, string>();
    for (const note of notes) {
      if (!participantMap.has(note.authorId)) {
        participantMap.set(note.authorId, note.author.name);
      }
    }
    const participants = Array.from(participantMap.entries()).map(
      ([id, name]) => ({ id, name }),
    );

    // Collect all unique tags
    const allTags = new Set<string>();
    for (const note of notes) {
      for (const tag of note.aiTags) {
        allTags.add(tag);
      }
    }

    // Related entities
    const relatedEntities = entityRefs.map((ref) => ({
      type: ref.referencedEntityType,
      typeLabel: CONTEXT_LABELS[ref.referencedEntityType] ?? ref.referencedEntityType,
      id: ref.referencedEntityId,
      label: ref.referencedEntityLabel,
      code: ref.referencedEntityCode,
    }));

    return NextResponse.json({
      success: true,
      data: {
        context: {
          type: contextType,
          typeLabel: CONTEXT_LABELS[contextType as NoteContextType] ?? contextType,
          id: contextId,
        },
        notes: notes.map((n) => ({
          id: n.id,
          content: n.content,
          noteType: n.noteType,
          author: n.author.name,
          createdAt: n.createdAt,
          tags: n.aiTags,
          sentiment: n.aiSentiment,
        })),
        decisions: decisionNotes.map((n) => ({
          content: n.content,
          author: n.author.name,
          createdAt: n.createdAt,
        })),
        pendingTasks: taskNotes.map((n) => ({
          content: n.content,
          author: n.author.name,
          createdAt: n.createdAt,
        })),
        participants,
        relatedEntities,
        tags: Array.from(allTags),
        existingSummary: existingSummary
          ? {
              summary: existingSummary.summary,
              periodStart: existingSummary.periodStart,
              periodEnd: existingSummary.periodEnd,
              noteCount: existingSummary.noteCount,
              topics: existingSummary.topics,
            }
          : null,
        totalNotes: notes.length,
      },
    });
  } catch (error) {
    if (isNotesTableMissing(error)) return notesNotAvailableResponse();
    console.error("Error fetching AI context:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contexto AI" },
      { status: 500 },
    );
  }
}
