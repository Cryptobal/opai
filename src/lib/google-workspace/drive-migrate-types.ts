export type MigrateResult = {
  rootsMerged: number;
  rootsTrashed: number;
  rootsSkipped: Array<{ id: string; reason: string }>;
  foldersMoved: number;
  foldersRenamed: number;
  cacheRewritten: number;
  outboxRewritten: number;
  hasMore: boolean;
  structureVersion: number;
};

export function emptyMigrateResult(): MigrateResult {
  return {
    rootsMerged: 0,
    rootsTrashed: 0,
    rootsSkipped: [],
    foldersMoved: 0,
    foldersRenamed: 0,
    cacheRewritten: 0,
    outboxRewritten: 0,
    hasMore: false,
    structureVersion: 1,
  };
}
