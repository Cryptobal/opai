-- Calendar v2 (agenda-v1): modelo aditivo de eventos con participantes internos,
-- externos, links por proveedor/participante, cursors de sync y auditoría.
-- Solo CREATE TABLE/INDEX — no toca agenda_visitas ni agenda_event_links.

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "calendarId" UUID,
    "kind" TEXT NOT NULL DEFAULT 'event',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startAt" TIMESTAMPTZ(6) NOT NULL,
    "endAt" TIMESTAMPTZ(6) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "transparency" TEXT NOT NULL DEFAULT 'busy',
    "visibility" TEXT NOT NULL DEFAULT 'tenant',
    "accountId" UUID,
    "installationId" UUID,
    "dealId" UUID,
    "created_by" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "calendar_events_tenant_id_startAt_idx"
    ON "public"."calendar_events"("tenant_id", "startAt");
CREATE INDEX IF NOT EXISTS "calendar_events_tenant_id_deletedAt_startAt_idx"
    ON "public"."calendar_events"("tenant_id", "deletedAt", "startAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_event_participants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "responseStatus" TEXT NOT NULL DEFAULT 'needs_action',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "calendar_event_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_event_participants_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "public"."calendar_events"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_participants_eventId_userId_key"
    ON "public"."calendar_event_participants"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "calendar_event_participants_tenantId_userId_responseStatus_idx"
    ON "public"."calendar_event_participants"("tenantId", "userId", "responseStatus");

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_external_attendees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "crmContactId" UUID,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "responseStatus" TEXT NOT NULL DEFAULT 'needs_action',

    CONSTRAINT "calendar_external_attendees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_external_attendees_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "public"."calendar_events"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_external_attendees_eventId_email_key"
    ON "public"."calendar_external_attendees"("eventId", "email");

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_event_reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,

    CONSTRAINT "calendar_event_reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_event_reminders_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "public"."calendar_events"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_provider_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "providerAccountId" TEXT NOT NULL,
    "providerCalendarId" TEXT NOT NULL,
    "providerEventId" TEXT,
    "htmlLink" TEXT,
    "role" TEXT NOT NULL DEFAULT 'organizer',
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "etag" TEXT,
    "localVersion" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "calendar_provider_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calendar_provider_links_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "public"."calendar_events"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_provider_links_eventId_provider_providerAccountId_key"
    ON "public"."calendar_provider_links"("eventId", "provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "calendar_provider_links_tenantId_provider_providerEventId_idx"
    ON "public"."calendar_provider_links"("tenantId", "provider", "providerEventId");
CREATE INDEX IF NOT EXISTS "calendar_provider_links_tenantId_syncStatus_idx"
    ON "public"."calendar_provider_links"("tenantId", "syncStatus");

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_sync_cursors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "providerAccountId" TEXT NOT NULL,
    "providerCalendarId" TEXT NOT NULL DEFAULT 'primary',
    "syncToken" TEXT,
    "channelId" TEXT,
    "resourceId" TEXT,
    "channelExpiresAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_sync_cursors_provider_account_calendar_key"
    ON "public"."calendar_sync_cursors"("provider", "providerAccountId", "providerCalendarId");
CREATE INDEX IF NOT EXISTS "calendar_sync_cursors_channelId_idx"
    ON "public"."calendar_sync_cursors"("channelId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."calendar_audit_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "calendar_audit_events_tenantId_eventId_createdAt_idx"
    ON "public"."calendar_audit_events"("tenantId", "eventId", "createdAt");
