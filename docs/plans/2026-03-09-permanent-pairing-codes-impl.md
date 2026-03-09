# Códigos de Pareo Permanentes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace temporary pairing codes with one permanent code per installation, unify rondas+acceso pairing, and expose codes in supervisor portal.

**Architecture:** Add `pairingCode` field to `CrmInstallation`. Both pairing flows (`/api/devices/pair` and `/api/access-control/pair`) validate against this field. Supervisor portal reads code from session data. Migration script generates codes for all active installations.

**Tech Stack:** Prisma, Next.js API routes, React (client components), Tailwind CSS

---

### Task 1: Add `pairingCode` field to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma:1385` (after `marcacionCode` line)

**Step 1: Add the field**

In `prisma/schema.prisma`, inside `model CrmInstallation`, add after the `marcacionCode` line (line 1385):

```prisma
  pairingCode     String?   @unique @map("pairing_code")
```

**Step 2: Generate migration**

Run: `npx prisma migrate dev --name add-installation-pairing-code`

**Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add pairingCode field to CrmInstallation"
```

---

### Task 2: Create migration script to generate codes for existing installations

**Files:**
- Create: `scripts/generate-pairing-codes.ts`

**Step 1: Write the script**

```typescript
import { PrismaClient } from "@prisma/client";

const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const installations = await prisma.crmInstallation.findMany({
      where: { isActive: true, pairingCode: null },
      select: { id: true, name: true },
    });

    console.log(`Found ${installations.length} active installations without pairing code`);

    let generated = 0;
    for (const inst of installations) {
      let code: string;
      let attempts = 0;
      // Retry loop to guarantee uniqueness
      while (true) {
        code = generatePairingCode();
        const existing = await prisma.crmInstallation.findUnique({
          where: { pairingCode: code },
        });
        if (!existing) break;
        attempts++;
        if (attempts > 10) throw new Error(`Too many collisions for ${inst.id}`);
      }

      await prisma.crmInstallation.update({
        where: { id: inst.id },
        data: { pairingCode: code },
      });
      generated++;
      console.log(`  [${generated}/${installations.length}] ${inst.name} → ${code}`);
    }

    console.log(`Done. Generated ${generated} pairing codes.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
```

**Step 2: Run it**

Run: `npx tsx scripts/generate-pairing-codes.ts`
Expected: All active installations get a unique pairing code.

**Step 3: Commit**

```bash
git add scripts/generate-pairing-codes.ts
git commit -m "feat: migration script to generate pairing codes for existing installations"
```

---

### Task 3: Rewrite generate-code API to update `installation.pairingCode`

**Files:**
- Modify: `src/app/api/devices/generate-code/[installationId]/route.ts` (full rewrite)

**Step 1: Rewrite the route**

Replace the entire file contents with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generatePairingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { installationId } = await params;

    // Generate unique code with retry
    let code: string;
    let attempts = 0;
    while (true) {
      code = generatePairingCode();
      const existing = await prisma.crmInstallation.findUnique({
        where: { pairingCode: code },
      });
      if (!existing) break;
      attempts++;
      if (attempts > 10) {
        return NextResponse.json(
          { success: false, error: "No se pudo generar un código único" },
          { status: 500 }
        );
      }
    }

    await prisma.crmInstallation.update({
      where: { id: installationId, tenantId: ctx.tenantId },
      data: { pairingCode: code },
    });

    return NextResponse.json({
      success: true,
      data: { code },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[devices/generate-code] Error:", msg);
    return NextResponse.json(
      { success: false, error: "Error al regenerar código de vinculación", detail: msg },
      { status: 500 }
    );
  }
}
```

Key changes:
- No more `DevicePairing` record creation
- No expiration
- Updates `CrmInstallation.pairingCode` directly
- Retry loop for uniqueness

**Step 2: Commit**

```bash
git add src/app/api/devices/generate-code/
git commit -m "feat: rewrite generate-code to update installation.pairingCode (permanent)"
```

---

### Task 4: Rewrite devices/pair API to validate against `installation.pairingCode`

**Files:**
- Modify: `src/app/api/devices/pair/route.ts` (lines 27-42)

**Step 1: Replace the pairing code lookup**

Replace lines 27-42 (the `normalizedCode` + `prisma.devicePairing.findFirst` block) with:

```typescript
    const normalizedCode = code.toUpperCase().replace(/[\s-]/g, "");
    const formattedCode = `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3)}`;

    // Find installation by permanent pairing code
    const installation = await prisma.crmInstallation.findUnique({
      where: { pairingCode: formattedCode },
      select: { id: true, name: true, address: true, tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Código inválido" },
        { status: 400 }
      );
    }
```

**Step 2: Replace the DevicePairing update (lines 56-81) with a create**

Replace the `prisma.devicePairing.update` block with:

```typescript
    const deviceToken = globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID();
    const deviceModel = parseDeviceModel(metadata.userAgent);
    const androidVersionMatch = metadata.userAgent.match(/Android\s+([\d.]+)/);
    const androidVersion = androidVersionMatch ? androidVersionMatch[1] : null;
    const browserVersionMatch = metadata.userAgent.match(/Chrome\/([\d.]+)/);
    const browserVersion = browserVersionMatch ? browserVersionMatch[1] : null;
    const screenResolution = metadata.screenWidth && metadata.screenHeight
      ? `${metadata.screenWidth}x${metadata.screenHeight}@${metadata.devicePixelRatio || 1}`
      : null;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const device = await prisma.devicePairing.create({
      data: {
        tenantId: installation.tenantId,
        installationId: installation.id,
        deviceToken,
        linkedAt: new Date(),
        name: deviceModel,
        deviceModel,
        androidVersion,
        browserVersion,
        screenResolution,
        cpuCores: metadata.cpuCores ?? null,
        ramGB: metadata.ramGB ?? null,
        userAgent: metadata.userAgent,
        deviceFingerprint: metadata.timezone
          ? `${metadata.language || ""}|${metadata.timezone}|${screenResolution || ""}`
          : null,
        pairingLatitude: metadata.latitude ?? null,
        pairingLongitude: metadata.longitude ?? null,
        lastSeenAt: new Date(),
        lastBatteryLevel: metadata.batteryLevel ?? null,
        lastConnectionType: metadata.connectionType ?? null,
        lastIpAddress: ip,
        portalRondasEnabled: true,
        portalAccesoEnabled: true,
      },
    });
```

**Step 3: Update the response (lines 83-96)**

Replace the installation query and response with:

```typescript
    return NextResponse.json({
      success: true,
      data: {
        deviceToken,
        installationId: installation.id,
        installationName: installation.name || "",
        installationAddress: installation.address || "",
        deviceId: device.id,
      },
    });
```

**Step 4: Commit**

```bash
git add src/app/api/devices/pair/
git commit -m "feat: pair devices against installation.pairingCode (permanent, reusable)"
```

---

### Task 5: Update access-control/pair API to validate against `installation.pairingCode`

**Files:**
- Modify: `src/app/api/access-control/pair/route.ts` (lines 37-67)

**Step 1: Replace the pairing code lookup (lines 37-67)**

Replace the `accessControlPairingCode.findUnique` + expiry/used checks with:

```typescript
    const normalizedCode = code.toUpperCase().replace(/[\s-]/g, "");
    const formattedCode = `${normalizedCode.slice(0, 3)}-${normalizedCode.slice(3)}`;

    // Find installation by permanent pairing code
    const installation = await prisma.crmInstallation.findUnique({
      where: { pairingCode: formattedCode },
      select: { id: true, name: true, address: true, tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Código de vinculación no válido" },
        { status: 404 }
      );
    }
```

**Step 2: Update the device creation (lines 74-88)**

Replace `pairingCode.tenantId` and `pairingCode.installationId` with `installation.tenantId` and `installation.id`:

```typescript
    const deviceToken = crypto.randomUUID() + crypto.randomUUID();
    const deviceName = parseDeviceName(userAgent || "");

    const device = await safeAccessControlQuery(
      () =>
        prisma.accessControlDevice.create({
          data: {
            tenantId: installation.tenantId,
            installationId: installation.id,
            deviceFingerprint,
            deviceName,
            deviceToken,
            userAgent: userAgent || null,
            screenResolution: screenResolution || null,
          },
        }),
      null
    );
```

**Step 3: Remove the "mark pairing code as used" block (lines 102-112)**

Delete the `prisma.accessControlPairingCode.update` block entirely — the code is permanent and not consumed.

**Step 4: Update the response (lines 115-128)**

Replace `pairingCode.installationId` references with `installation.id`:

```typescript
    return NextResponse.json({
      success: true,
      data: {
        deviceToken,
        installationId: installation.id,
        installationName: installation?.name ?? null,
        installationAddress: installation?.address ?? null,
        deviceId: device.id,
      },
    });
```

**Step 5: Commit**

```bash
git add src/app/api/access-control/pair/
git commit -m "feat: access-control pair against installation.pairingCode"
```

---

### Task 6: Add `pairingCode` to supervisor session and API

**Files:**
- Modify: `src/lib/portal-supervisor.ts:3-12` (SupervisorInstallation interface)
- Modify: `src/lib/portal-supervisor.ts:57-67` (installations mapping)

**Step 1: Add `pairingCode` to the interface (line 12)**

Add after `isActive: boolean;`:

```typescript
  pairingCode: string | null;
```

**Step 2: Include pairingCode in the query select (line 49-53)**

Update the `include.installation` to also select `pairingCode`. Add it to the installation include:

```typescript
    include: {
      installation: {
        include: {
          account: { select: { id: true, name: true, status: true } },
        },
      },
    },
```

The `installation` is already fully included, so `pairingCode` is already available in `a.installation`.

**Step 3: Add to the mapping (line 57-67)**

Add `pairingCode: a.installation.pairingCode ?? null,` to the map:

```typescript
  const installations: SupervisorInstallation[] = assignments.map((a) => ({
    id: a.installation.id,
    name: a.installation.name,
    address: a.installation.address ?? null,
    accountId: a.installation.account?.id ?? "",
    accountName: a.installation.account?.name ?? "",
    lat: a.installation.lat ?? null,
    lng: a.installation.lng ?? null,
    geoRadiusM: a.installation.geoRadiusM,
    isActive: a.installation.isActive,
    pairingCode: a.installation.pairingCode ?? null,
  }));
```

**Step 4: Commit**

```bash
git add src/lib/portal-supervisor.ts
git commit -m "feat: include pairingCode in supervisor session installations"
```

---

### Task 7: Add pairing code to supervisor installations list

**Files:**
- Modify: `src/components/portal/supervisor/SupervisorInstalaciones.tsx:118-153` (InstallationCard)

**Step 1: Add Copy import**

Add to the lucide-react imports at line 4:

```typescript
import { MapPin, ChevronRight, Loader2, Search, Copy } from "lucide-react";
```

**Step 2: Add pairing code display to InstallationCard**

After the address line (line 137-138), add the pairing code display:

```tsx
        {installation.pairingCode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(installation.pairingCode!);
            }}
            className="flex items-center gap-1 mt-1 text-xs text-blue-400 hover:text-blue-300"
            title="Copiar código"
          >
            <Copy size={10} />
            <span className="font-mono">{installation.pairingCode}</span>
          </button>
        )}
```

**Step 3: Commit**

```bash
git add src/components/portal/supervisor/SupervisorInstalaciones.tsx
git commit -m "feat: show pairing code in supervisor installations list"
```

---

### Task 8: Add pairing code section to supervisor installation detail

**Files:**
- Modify: `src/components/portal/supervisor/SupervisorInstalacionDetail.tsx:1-18` (imports)
- Modify: `src/components/portal/supervisor/SupervisorInstalacionDetail.tsx:116-117` (after address, before quick actions)

**Step 1: Add imports**

Add `Copy, LinkIcon, CheckCircle2` to the lucide-react imports (line 4-18):

```typescript
import {
  ArrowLeft,
  MapPin,
  Users,
  ClipboardCheck,
  AlertTriangle,
  MessageSquare,
  Plus,
  Clock,
  FileText,
  Ticket,
  Loader2,
  ExternalLink,
  Briefcase,
  Copy,
  LinkIcon,
  CheckCircle2,
} from "lucide-react";
```

**Step 2: Add state for copy feedback**

After line 57 (`const [loading, setLoading] = useState(true);`), add:

```typescript
  const [copied, setCopied] = useState(false);
```

Add `useState` is already imported.

**Step 3: Add pairing code section**

After the address block (line 116, after the closing `}` of the address div), and before the quick actions grid (line 118), insert:

```tsx
      {/* Pairing Code */}
      {installation.pairingCode && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon size={14} className="text-blue-400" />
            <span className="text-sm font-medium text-zinc-200">Código de Pareo</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-3">
              <span className="font-mono text-2xl font-bold tracking-[0.25em] text-zinc-100">
                {installation.pairingCode}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(installation.pairingCode!);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={14} className="text-green-400" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copiar
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Ingresa este código en el dispositivo para vincularlo a esta instalación.
          </p>
        </div>
      )}
```

**Step 4: Commit**

```bash
git add src/components/portal/supervisor/SupervisorInstalacionDetail.tsx
git commit -m "feat: pairing code section in supervisor installation detail"
```

---

### Task 9: Simplify admin UnifiedDevicesSection (remove expiry logic)

**Files:**
- Modify: `src/components/devices/UnifiedDevicesSection.tsx` (multiple sections)

**Step 1: Add `pairingCode` prop and remove expiry state**

Update the Props interface (line 66-68) to accept `pairingCode`:

```typescript
interface Props {
  installationId: string;
  pairingCode: string | null;
}
```

Update the component signature (line 110):

```typescript
export function UnifiedDevicesSection({ installationId, pairingCode: initialPairingCode }: Props) {
```

Replace the state declarations (lines 113-122):

```typescript
  const [devices, setDevices] = useState<DevicePairingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCode, setCurrentCode] = useState<string | null>(initialPairingCode);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<DevicePairingRecord | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
```

Remove: `pairingCode` state (line 113), `countdown` state (line 118), `countdownRef` (line 119), `genRondas` (line 121), `genAcceso` (line 122).

**Step 2: Remove countdown timer effect (lines 140-160)**

Delete the entire `useEffect` block that manages the countdown timer.

**Step 3: Simplify generateCode (lines 162-185)**

Replace with:

```typescript
  const regenerateCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await fetch(`/api/devices/generate-code/${installationId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setCurrentCode(json.data.code);
        toast.success("Código regenerado");
      } else {
        toast.error(json.error || "Error al regenerar código");
      }
    } catch {
      toast.error("Error al regenerar código");
    } finally {
      setGeneratingCode(false);
    }
  };
```

**Step 4: Simplify copyCode (lines 187-192)**

Replace with:

```typescript
  const copyCode = () => {
    if (currentCode) {
      navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Código copiado");
    }
  };
```

**Step 5: Replace the "Generate Pairing Code" section (lines 417-503)**

Replace the entire pairing code section with:

```tsx
      {/* Permanent Pairing Code */}
      <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-4">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <LinkIcon className="h-4 w-4" />
          Vincular Nuevo Dispositivo
        </div>

        {currentCode ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-zinc-600 bg-zinc-800 px-5 py-3">
                <span className="font-mono text-2xl font-bold tracking-[0.25em] text-zinc-100">
                  {currentCode}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyCode}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  {copied ? (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={regenerateCode}
                  disabled={generatingCode}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  {generatingCode ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Regenerar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-xs text-zinc-500">
                Código permanente · Rondas y Acceso
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <Button
              onClick={regenerateCode}
              disabled={generatingCode}
              variant="outline"
              size="sm"
              className="border-zinc-600"
            >
              {generatingCode ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <LinkIcon className="mr-2 h-3.5 w-3.5" />
              )}
              Generar Código de Emparejamiento
            </Button>
          </div>
        )}
      </div>
```

**Step 6: Remove unused imports and interfaces**

- Remove `PairingCodeResponse` interface (lines 60-64)
- Remove `CODE_EXPIRY_MS` constant (line 70)
- Remove `formatCountdown` function (lines 102-108)
- Remove `Clock` from lucide imports if no longer used

**Step 7: Commit**

```bash
git add src/components/devices/UnifiedDevicesSection.tsx
git commit -m "feat: simplify UnifiedDevicesSection — permanent code, no expiry"
```

---

### Task 10: Update parent component that renders UnifiedDevicesSection

**Files:**
- Search for where `<UnifiedDevicesSection` is rendered and pass `pairingCode` prop

**Step 1: Find usage**

Run: `grep -rn "UnifiedDevicesSection" src/ --include="*.tsx"`

The parent component needs to pass the `pairingCode` from the installation data. Add `pairingCode={installation.pairingCode}` to the `<UnifiedDevicesSection>` call.

**Step 2: Commit**

```bash
git add <parent-file>
git commit -m "feat: pass pairingCode prop to UnifiedDevicesSection"
```

---

### Task 11: Verify and test end-to-end

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

**Step 2: Run the dev server**

Run: `npm run dev`

**Step 3: Manual testing checklist**

1. Admin panel: Open an installation → see permanent pairing code (no countdown)
2. Admin panel: Click "Regenerar" → code changes
3. Admin panel: Click "Copiar" → code copies to clipboard
4. Supervisor portal: Open installations list → see code on each card
5. Supervisor portal: Open installation detail → see code with copy button
6. Device pairing: Enter code on mobile → device pairs successfully
7. Device pairing: Enter same code on second device → also pairs (code is reusable)

**Step 4: Commit**

```bash
git commit -m "feat: permanent pairing codes — complete implementation"
```
