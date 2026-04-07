# Push Notification Wiring — All Portals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire `sendPushToPortalUser` calls in every relevant API endpoint so all 32 notification types defined in `portal-notification-types.ts` actually fire when those events occur.

**Architecture:** Each endpoint imports `sendPushToPortalUser` (or the new helper `sendPushToAdmins`) dynamically, wraps the call in try/catch, and fires after the main DB transaction succeeds. A new exported helper `sendPushToAdmins` is added to `push-service.ts` to avoid repeating the "find all active admins → push each one" pattern.

**Tech Stack:** Next.js 15 API Routes, Prisma, web-push (via `push-service.ts`), TypeScript.

---

## Key reference: `sendPushToPortalUser` signature

```typescript
// src/lib/pwa/push-service.ts (already exists)
sendPushToPortalUser({
  tenantId: string,
  notifKey: string,         // must match a key in PORTAL_NOTIFICATION_TYPES
  userType: 'contact' | 'guardia' | 'admin',
  userId: string,
  portalType: 'cliente' | 'guardia' | 'rondas' | 'app',
  title: string,
  body: string,
  url?: string,
  tag?: string,
})
```

All push calls MUST use dynamic import to avoid build failures in CI (VAPID keys absent):
```typescript
const { sendPushToAdmins } = await import('@/lib/pwa/push-service');
```

---

## Task 1: Add `sendPushToAdmins` and `sendPushToSpecificAdmins` helpers to push-service.ts

**Files:**
- Modify: `src/lib/pwa/push-service.ts`

**Why:** Multiple endpoints need to push to "all active admins in tenant". Without a helper, each endpoint would repeat the same `prisma.admin.findMany` + loop. These two helpers cover all admin push patterns:
- `sendPushToAdmins` — broadcast to all owner/admin in tenant
- `sendPushToSpecificAdmins` — push only to a known list of admin IDs (e.g., approval group)

**Step 1: Read the current push-service.ts**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/lib/pwa/push-service.ts
```

**Step 2: Append the two helpers at the END of the file** (after the existing `sendPushToPortalUser` function):

```typescript
/**
 * Broadcast push to all active owner/admin users in a tenant.
 * Fails open — individual subscription failures are swallowed.
 */
export async function sendPushToAdmins(
  tenantId: string,
  notifKey: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  const admins = await prisma.admin.findMany({
    where: { tenantId, role: { in: ['owner', 'admin'] }, status: 'active' },
    select: { id: true },
  });
  await Promise.allSettled(
    admins.map((admin) =>
      sendPushToPortalUser({
        tenantId,
        notifKey,
        userType: 'admin',
        userId: admin.id,
        portalType: 'app',
        title,
        body,
        url,
      })
    )
  );
}

/**
 * Push to a specific list of admin user IDs (e.g., approval group members).
 */
export async function sendPushToSpecificAdmins(
  tenantId: string,
  adminIds: string[],
  notifKey: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  if (adminIds.length === 0) return;
  await Promise.allSettled(
    adminIds.map((userId) =>
      sendPushToPortalUser({
        tenantId,
        notifKey,
        userType: 'admin',
        userId,
        portalType: 'app',
        title,
        body,
        url,
      })
    )
  );
}
```

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "push-service"
```
Expected: no errors.

**Step 4: Commit**

```bash
git add src/lib/pwa/push-service.ts
git commit -m "feat(push): add sendPushToAdmins and sendPushToSpecificAdmins helpers"
```

---

## Task 2: ticket_needs_approval → ops ticket creation

**Files:**
- Modify: `src/app/api/ops/tickets/route.ts`

**Context:** When a ticket is created with an approval workflow, the approver group members need a push. The POST handler already calls `sendNotificationToUsers(approvalTargetIds, ...)`. After that block, add the push.

The key variables available at the end of the POST handler:
- `ticket.id` — the newly created ticket ID
- `ctx.tenantId`
- `approvalTargetIds` — array of admin user IDs who need to approve (only populated when `needsApproval` is true)
- `ticket.title` (or `body.title`)
- `ticket.code`

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/ops/tickets/route.ts
```

**Step 2: Find the notification block** — look for `sendNotificationToUsers` near the end of the POST handler. After that entire try/catch notification block, add:

```typescript
    // Push notification: ticket needs approval
    if (needsApproval && approvalTargetIds.length > 0) {
      try {
        const { sendPushToSpecificAdmins } = await import('@/lib/pwa/push-service');
        await sendPushToSpecificAdmins(
          ctx.tenantId,
          approvalTargetIds,
          'ticket_needs_approval',
          `Ticket ${ticket.code} pendiente de aprobación`,
          `"${body.title}" requiere tu aprobación`,
          `/opai/ops/tickets/${ticket.id}`,
        );
      } catch (err) {
        console.error('[OPS] Error sending ticket_needs_approval push:', err);
      }
    }
```

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "ops/tickets/route"
```

**Step 4: Commit**

```bash
git add src/app/api/ops/tickets/route.ts
git commit -m "feat(push): send ticket_needs_approval push to approval group on ticket creation"
```

---

## Task 3: document_signed → docs signing endpoint

**Files:**
- Modify: `src/app/api/docs/sign/[token]/route.ts`

**Context:** The POST handler processes a document signature. After all signatures are collected and the document status is updated to "completed", it already sends email to admins. Add push after the email block.

Key variables available after the signing logic:
- `result.tenantId`
- `result.title` — document title
- `result.id` — document ID
- The signing completes when `result.status === 'completed'` (all recipients have signed)

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/docs/sign/[token]/route.ts
```

**Step 2: Find where the document reaches "completed" status** — look for `status: "completed"` or similar. After the existing email notification block (which fetches `adminUsers`), add:

```typescript
      // Push: notify admins that document was signed/completed
      try {
        const { sendPushToAdmins } = await import('@/lib/pwa/push-service');
        await sendPushToAdmins(
          result.tenantId,
          'document_signed',
          'Documento firmado',
          `"${result.title}" ha sido firmado`,
          `/opai/docs/documentos/${result.id}`,
        );
      } catch (err) {
        console.error('[DOCS] Error sending document_signed push:', err);
      }
```

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "docs/sign"
```

**Step 4: Commit**

```bash
git add src/app/api/docs/sign/[token]/route.ts
git commit -m "feat(push): send document_signed push to admins when document is fully signed"
```

---

## Task 4: lead_new → CRM lead creation

**Files:**
- Modify: `src/app/api/crm/leads/route.ts`

**Context:** POST handler creates a new CRM lead. After `prisma.lead.create(...)` succeeds, add push to all admins. The lead object is the result of the create call.

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/crm/leads/route.ts
```

**Step 2: After the successful `prisma.lead.create(...)` call and before `return NextResponse.json(...)`, add:**

```typescript
      // Push: notify admins of new lead
      try {
        const { sendPushToAdmins } = await import('@/lib/pwa/push-service');
        await sendPushToAdmins(
          ctx.tenantId,
          'lead_new',
          'Nuevo lead registrado',
          `${lead.firstName} ${lead.lastName}${lead.company ? ` — ${lead.company}` : ''}`,
          `/opai/crm/leads`,
        );
      } catch (err) {
        console.error('[CRM] Error sending lead_new push:', err);
      }
```

Note: the lead variable name may differ — check what the `prisma.lead.create` result is assigned to.

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "crm/leads/route"
```

**Step 4: Commit**

```bash
git add src/app/api/crm/leads/route.ts
git commit -m "feat(push): send lead_new push to admins when CRM lead is created"
```

---

## Task 5: quote_accepted / quote_rejected → CPQ quote status update

**Files:**
- Modify: `src/app/api/cpq/quotes/[id]/route.ts`

**Context:** PATCH handler updates quote fields. If `body.status` changes to `'accepted'` or `'rejected'`, send the appropriate push to all admins.

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/cpq/quotes/[id]/route.ts
```

**Step 2: After the successful PATCH update, add:**

```typescript
    // Push: quote accepted or rejected
    if (body.status === 'accepted' || body.status === 'rejected') {
      try {
        const { sendPushToAdmins } = await import('@/lib/pwa/push-service');
        const notifKey = body.status === 'accepted' ? 'quote_accepted' : 'quote_rejected';
        const statusLabel = body.status === 'accepted' ? 'aceptada' : 'rechazada';
        await sendPushToAdmins(
          ctx.tenantId,
          notifKey,
          `Cotización ${statusLabel}`,
          `La cotización "${updatedQuote.name || updatedQuote.id}" fue ${statusLabel}`,
          `/opai/cpq/cotizaciones/${params.id}`,
        );
      } catch (err) {
        console.error('[CPQ] Error sending quote status push:', err);
      }
    }
```

Note: check the variable name for the updated quote result — may be `updatedQuote`, `quote`, or similar.

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "cpq/quotes"
```

**Step 4: Commit**

```bash
git add src/app/api/cpq/quotes/[id]/route.ts
git commit -m "feat(push): send quote_accepted/quote_rejected push to admins on CPQ status change"
```

---

## Task 6: expense_report_submitted → rendición submit

**Files:**
- Modify: `src/app/api/finance/rendiciones/[id]/submit/route.ts`

**Context:** POST handler submits a rendición for approval. It already fetches `approvers` (array of admin users with email). Add push to those same approvers after the email notification.

The `approverIds` variable holds the target admin IDs. The `rendicion` object has `id`, `title` or `month`/`year` fields.

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/finance/rendiciones/[id]/submit/route.ts
```

**Step 2: After the existing `notifyRendicionSubmitted()` call, add:**

```typescript
      // Push: notify approvers that rendición was submitted
      try {
        const { sendPushToSpecificAdmins } = await import('@/lib/pwa/push-service');
        const submitterName = submitter?.name ?? 'Un supervisor';
        await sendPushToSpecificAdmins(
          ctx.tenantId,
          approverIds,
          'expense_report_submitted',
          'Rendición de gastos enviada',
          `${submitterName} envió una rendición para revisión`,
          `/opai/finance/rendiciones/${params.id}`,
        );
      } catch (err) {
        console.error('[FINANCE] Error sending expense_report_submitted push:', err);
      }
```

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "rendiciones"
```

**Step 4: Commit**

```bash
git add src/app/api/finance/rendiciones/[id]/submit/route.ts
git commit -m "feat(push): send expense_report_submitted push to approvers on rendición submit"
```

---

## Task 7: ronda_assigned → ronda execution generation (portal rondas)

**Files:**
- Modify: `src/app/api/ops/rondas/ejecuciones/route.ts`

**Context:** POST handler generates ronda execution slots and assigns a guardia to each slot. After `prisma.opsRondaEjecucion.createMany(...)`, collect the unique guardia IDs that were assigned and send `ronda_assigned` push to each one via portal `rondas`.

The `slots` array (or similar) contains objects with `guardiaId`. Push only to guardias who have a `guardiaId` assigned (not null).

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/ops/rondas/ejecuciones/route.ts
```

**Step 2: After the `createMany` call, add:**

```typescript
    // Push: notify assigned guardias of new ronda assignments
    try {
      const uniqueGuardiaIds = [...new Set(
        slots
          .filter((s: { guardiaId?: string | null }) => s.guardiaId)
          .map((s: { guardiaId: string }) => s.guardiaId)
      )];
      if (uniqueGuardiaIds.length > 0) {
        const { sendPushToPortalUser } = await import('@/lib/pwa/push-service');
        await Promise.allSettled(
          uniqueGuardiaIds.map((guardiaId) =>
            sendPushToPortalUser({
              tenantId: ctx.tenantId,
              notifKey: 'ronda_assigned',
              userType: 'guardia',
              userId: guardiaId,
              portalType: 'rondas',
              title: 'Nueva ronda asignada',
              body: 'Tienes una nueva ronda programada para ejecutar',
              url: '/portal/rondas',
            })
          )
        );
      }
    } catch (err) {
      console.error('[RONDAS] Error sending ronda_assigned push:', err);
    }
```

Note: The exact variable name for the slots array and guardiaId field may differ — check the file.

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "rondas/ejecuciones"
```

**Step 4: Commit**

```bash
git add src/app/api/ops/rondas/ejecuciones/route.ts
git commit -m "feat(push): send ronda_assigned push to guardias on ronda execution generation"
```

---

## Task 8: document_expiring → document-alerts cron

**Files:**
- Modify: `src/app/api/cron/document-alerts/route.ts`

**Context:** Daily cron that finds documents approaching expiration and updates their status. It already sends notifications via the generic `sendNotification()`. Add push to all admins for each expiring document.

Important: this cron can process many documents at once — use `Promise.allSettled` and don't await individually.

**Step 1: Read the file**

```bash
cat /Users/caco/Desktop/Cursor/opai/src/app/api/cron/document-alerts/route.ts
```

**Step 2: Find the loop where documents are processed** — after the existing notification call inside the document loop, add (inside the same try/catch or a new one):

```typescript
        // Push: document expiring soon
        try {
          const { sendPushToAdmins } = await import('@/lib/pwa/push-service');
          await sendPushToAdmins(
            doc.tenantId,
            'document_expiring',
            'Documento por vencer',
            `"${doc.title}" vence en ${daysUntilExpiry} días`,
            `/opai/docs/documentos/${doc.id}`,
          );
        } catch (pushErr) {
          console.error('[CRON] Error sending document_expiring push:', pushErr);
        }
```

Note: `doc.tenantId`, `doc.title`, `doc.id`, and `daysUntilExpiry` variable names may differ — check the actual file.

**Step 3: TypeScript check**

```bash
cd /Users/caco/Desktop/Cursor/opai && npx tsc --noEmit 2>&1 | grep "document-alerts"
```

**Step 4: Final commit and push**

```bash
git add src/app/api/cron/document-alerts/route.ts
git commit -m "feat(push): send document_expiring push to admins in document-alerts cron"
git push origin main
```

---

## What's NOT covered in this plan (future work)

These require new cron logic or more complex changes — scope separately:

| notifKey | What's needed |
|----------|---------------|
| `contract_expiring` | `cron/contract-alerts` currently has no notification at all — needs both notification + push added |
| `guard_no_checkin` | No existing cron or check-in tracking endpoint found |
| `invoice_due` | No invoice/payment tracking endpoint found |
| `supervision_visit_due` | No cron for supervision visit scheduling found |
| `payroll_processed` | Payroll endpoint exists but not explored |
| `document_available` (cliente) | Need to find doc-sharing-to-contact endpoint |
| `ticket_assigned_guard` | Ticket update/assignment endpoint needed |
| `checkpoint_missed` | Complex ronda checkpoint tracking |
| `ronda_cancelled` | Ronda cancellation endpoint needed |
| `emergency_alert` | Manual trigger or new mechanism needed |
| `ronda_alert_admin` | Ronda alert creation endpoint (alertas POST) needed |
