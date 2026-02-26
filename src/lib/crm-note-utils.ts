type NoteEntityType =
  | "account"
  | "contact"
  | "deal"
  | "quote"
  | "installation"
  | "ops_guardia"
  | "installation_pauta";

export interface NoteMentionUser {
  id: string;
  name: string;
  email?: string | null;
}

export interface NoteMentionGroup {
  id: string;
  name: string;
  slug: string;
  memberIds: string[];
}

export interface NoteMentionResolution {
  mentionAll: boolean;
  specialMentions: string[];
  userMentionIds: string[];
  groupMentionIds: string[];
  groupUserIds: string[];
  resolvedRecipientIds: string[];
  metadata: Record<string, unknown>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeContent(content: string): string {
  return content.replace(/\u00A0/g, " ");
}

function hasMention(content: string, rawCandidate: string): boolean {
  const candidate = rawCandidate.trim();
  if (!candidate) return false;
  const escaped = escapeRegex(candidate);
  const pattern = new RegExp(`(?:^|\\s)[@＠]${escaped}(?=\\s|$|[.,;:!?])`, "iu");
  return pattern.test(content);
}

export function resolveMentionsFromContent(
  rawContent: string,
  users: NoteMentionUser[],
  groups: NoteMentionGroup[],
  authorId: string
): NoteMentionResolution {
  const content = normalizeContent(rawContent);
  const specialTokens = Array.from(
    new Set(
      [...content.matchAll(/(?:^|\s)[@＠](todos|all)(?=\s|$|[.,;:!?])/giu)].map((m) =>
        (m[1] || "").toLowerCase()
      )
    )
  );
  const mentionAll = specialTokens.length > 0;

  const mentionedUsers = users.filter((user) => {
    if (hasMention(content, user.name)) return true;
    if (user.email && hasMention(content, user.email)) return true;
    return false;
  });
  const mentionedGroups = groups.filter(
    (group) => hasMention(content, group.name) || hasMention(content, group.slug)
  );

  const userMentionIds = mentionedUsers.map((user) => user.id);
  const groupMentionIds = mentionedGroups.map((group) => group.id);
  const groupUserIds = Array.from(
    new Set(mentionedGroups.flatMap((group) => group.memberIds))
  );

  const resolvedRecipientIds = mentionAll
    ? users.map((user) => user.id).filter((id) => id !== authorId)
    : Array.from(new Set([...userMentionIds, ...groupUserIds])).filter(
        (id) => id !== authorId
      );

  return {
    mentionAll,
    specialMentions: specialTokens,
    userMentionIds,
    groupMentionIds,
    groupUserIds,
    resolvedRecipientIds,
    metadata: {
      mentionAll,
      specialMentions: specialTokens,
      users: mentionedUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email ?? null,
      })),
      groups: mentionedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        slug: group.slug,
        memberCount: group.memberIds.length,
        memberIds: group.memberIds,
      })),
      resolvedRecipientIds,
    },
  };
}

function appendQuery(basePath: string, params: Record<string, string | null | undefined>): string {
  const [path, query = ""] = basePath.split("?");
  const search = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    search.set(key, value);
  }
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function getEntityBaseLink(entityType: NoteEntityType, entityId: string): { path: string; openSectionKey?: string } | null {
  if (entityType === "account") return { path: `/crm/accounts/${entityId}`, openSectionKey: "notes" };
  if (entityType === "contact") return { path: `/crm/contacts/${entityId}`, openSectionKey: "notes" };
  if (entityType === "deal") return { path: `/crm/deals/${entityId}`, openSectionKey: "notes" };
  if (entityType === "quote") return { path: `/crm/cotizaciones/${entityId}` };
  if (entityType === "installation") return { path: `/crm/installations/${entityId}`, openSectionKey: "notes" };
  if (entityType === "ops_guardia") return { path: `/personas/guardias/${entityId}`, openSectionKey: "comentarios" };
  if (entityType === "installation_pauta") {
    const [installationId] = entityId.split("_");
    if (!installationId) return { path: "/ops/pauta-mensual" };
    return { path: `/ops/pauta-mensual?installationId=${installationId}` };
  }
  return null;
}

export function buildNoteDeepLink(input: {
  entityType: NoteEntityType;
  entityId: string;
  noteId: string;
  rootNoteId: string;
  focusReply?: boolean;
}): string | null {
  const base = getEntityBaseLink(input.entityType, input.entityId);
  if (!base) return null;
  const withQuery = appendQuery(base.path, {
    openSection: base.openSectionKey,
    noteId: input.noteId,
    replyTo: input.rootNoteId,
    focusReply: input.focusReply ? "1" : undefined,
  });
  if (!base.openSectionKey) return withQuery;
  return `${withQuery}#section-${base.openSectionKey}`;
}
