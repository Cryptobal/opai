/**
 * Detección de cuentas CRM duplicadas: similitud de nombre y clustering global.
 */

import { cleanRut } from "@/lib/chile-rut";

export type DuplicateAccountCandidate = {
  id: string;
  name: string;
  rut: string | null;
  legalName: string | null;
  type: string;
  status: string;
  isActive: boolean;
  createdAt: Date | string;
  _count: { contacts: number; deals: number; installations: number };
};

export type ScoredDuplicateAccount = DuplicateAccountCandidate & { score: number };

export type DuplicateClusterReason = "rut" | "name" | "rut_name";

export type DuplicateCluster = {
  id: string;
  reason: DuplicateClusterReason;
  score: number;
  accounts: ScoredDuplicateAccount[];
};

export function normalizeAccountName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens poco discriminantes en nombres de empresas chilenas. */
const STOP_WORDS = new Set([
  "sa",
  "spa",
  "ltda",
  "eirl",
  "de",
  "la",
  "el",
  "los",
  "las",
  "y",
  "del",
  "company",
  "compania",
  "sociedad",
  "comercial",
]);

export function significantTokens(normalizedName: string): string[] {
  return normalizedName.split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeAccountName(a);
  const nb = normalizeAccountName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const la = na.length;
  const lb = nb.length;
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] =
        na[i - 1] === nb[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const maxLen = Math.max(la, lb);
  return 1 - dp[la][lb] / maxLen;
}

export function scoreAccountsAgainstQuery(
  accounts: DuplicateAccountCandidate[],
  query: string,
  threshold = 0.45
): ScoredDuplicateAccount[] {
  return accounts
    .map((acc) => ({ ...acc, score: nameSimilarity(acc.name, query) }))
    .filter((acc) => acc.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

class UnionFind {
  private parent: Map<string, string> = new Map();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const p = this.parent.get(id);
    if (p == null) {
      this.parent.set(id, id);
      return id;
    }
    if (p !== id) {
      const root = this.find(p);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const list = out.get(root) ?? [];
      list.push(id);
      out.set(root, list);
    }
    return out;
  }
}

const NAME_CLUSTER_THRESHOLD = 0.82;

/**
 * Agrupa cuentas posiblemente duplicadas: mismo RUT normalizado y/o nombre muy similar.
 * Usa buckets por token significativo para evitar O(n²) completo.
 */
export function clusterDuplicateAccounts(
  accounts: DuplicateAccountCandidate[]
): DuplicateCluster[] {
  if (accounts.length < 2) return [];

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const uf = new UnionFind();
  for (const a of accounts) uf.add(a.id);

  const edgeMeta = new Map<string, { reason: DuplicateClusterReason; score: number }>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const markEdge = (a: string, b: string, reason: DuplicateClusterReason, score: number) => {
    uf.union(a, b);
    const key = edgeKey(a, b);
    const prev = edgeMeta.get(key);
    if (!prev || score > prev.score || (reason === "rut" && prev.reason !== "rut")) {
      const mergedReason: DuplicateClusterReason =
        prev && prev.reason !== reason
          ? prev.reason === "rut" || reason === "rut"
            ? "rut_name"
            : reason
          : reason;
      edgeMeta.set(key, { reason: mergedReason, score: Math.max(score, prev?.score ?? 0) });
    }
  };

  // 1) Mismo RUT
  const byRut = new Map<string, string[]>();
  for (const acc of accounts) {
    if (!acc.rut) continue;
    const key = cleanRut(acc.rut);
    if (key.length < 8) continue;
    const list = byRut.get(key) ?? [];
    list.push(acc.id);
    byRut.set(key, list);
  }
  for (const ids of byRut.values()) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) {
      markEdge(ids[0], ids[i], "rut", 1);
    }
  }

  // 2) Nombre normalizado exacto
  const byExactName = new Map<string, string[]>();
  for (const acc of accounts) {
    const key = normalizeAccountName(acc.name);
    if (key.length < 3) continue;
    const list = byExactName.get(key) ?? [];
    list.push(acc.id);
    byExactName.set(key, list);
  }
  for (const ids of byExactName.values()) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i++) {
      markEdge(ids[0], ids[i], "name", 1);
    }
  }

  // 3) Fuzzy por bucket de primer token significativo
  const byToken = new Map<string, string[]>();
  for (const acc of accounts) {
    const tokens = significantTokens(normalizeAccountName(acc.name));
    const bucketKey = tokens[0];
    if (!bucketKey) continue;
    const list = byToken.get(bucketKey) ?? [];
    list.push(acc.id);
    byToken.set(bucketKey, list);
  }

  for (const ids of byToken.values()) {
    if (ids.length < 2) continue;
    // Cap por bucket para no explotar en nombres genéricos
    const capped = ids.slice(0, 80);
    for (let i = 0; i < capped.length; i++) {
      const a = byId.get(capped[i])!;
      for (let j = i + 1; j < capped.length; j++) {
        const b = byId.get(capped[j])!;
        const score = nameSimilarity(a.name, b.name);
        if (score >= NAME_CLUSTER_THRESHOLD) {
          markEdge(a.id, b.id, "name", score);
        }
      }
    }
  }

  const clusters: DuplicateCluster[] = [];
  for (const [, ids] of uf.groups()) {
    if (ids.length < 2) continue;

    let bestScore = 0;
    let hasRut = false;
    let hasName = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const meta = edgeMeta.get(edgeKey(ids[i], ids[j]));
        if (!meta) continue;
        if (meta.reason === "rut" || meta.reason === "rut_name") hasRut = true;
        if (meta.reason === "name" || meta.reason === "rut_name") hasName = true;
        bestScore = Math.max(bestScore, meta.score);
      }
    }
    if (bestScore === 0) continue;
    const bestReason: DuplicateClusterReason =
      hasRut && hasName ? "rut_name" : hasRut ? "rut" : "name";

    const scored = ids
      .map((id) => {
        const acc = byId.get(id)!;
        const peerScores = ids
          .filter((other) => other !== id)
          .map((other) => edgeMeta.get(edgeKey(id, other))?.score ?? nameSimilarity(acc.name, byId.get(other)!.name));
        return { ...acc, score: Math.max(...peerScores, 0) };
      })
      .sort((a, b) => {
        const weight = (x: ScoredDuplicateAccount) =>
          x._count.contacts + x._count.deals + x._count.installations;
        return weight(b) - weight(a) || b.score - a.score;
      });

    clusters.push({
      id: ids.slice().sort().join("-"),
      reason: bestReason,
      score: bestScore,
      accounts: scored,
    });
  }

  const reasonRank: Record<DuplicateClusterReason, number> = {
    rut_name: 0,
    rut: 1,
    name: 2,
  };

  return clusters.sort(
    (a, b) =>
      reasonRank[a.reason] - reasonRank[b.reason] ||
      b.score - a.score ||
      b.accounts.length - a.accounts.length
  );
}

export function clusterReasonLabel(reason: DuplicateClusterReason): string {
  switch (reason) {
    case "rut":
      return "Mismo RUT";
    case "rut_name":
      return "Mismo RUT y nombre similar";
    case "name":
      return "Nombre similar";
  }
}
