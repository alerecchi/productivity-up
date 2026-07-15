const MIGRATION_FLOW_STARTED_STORAGE_KEY = 'productivity-up:migration-flow-started'

export function clearStoredMigrationFlowStarted() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(MIGRATION_FLOW_STARTED_STORAGE_KEY)
  } catch {
    // Best-effort cleanup only.
  }
}

export function getStoredMigrationFlowBucketIds() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    return (
      window.sessionStorage
        .getItem(MIGRATION_FLOW_STARTED_STORAGE_KEY)
        ?.split(',')
        .map((id) => Number(id))
        .filter(Number.isFinite) ?? []
    )
  } catch {
    return []
  }
}

export function storeMigrationFlowStarted(pendingMigrationBuckets: Array<{ id: number }>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(
      MIGRATION_FLOW_STARTED_STORAGE_KEY,
      pendingMigrationBuckets.map((bucket) => bucket.id).join(','),
    )
  } catch {
    // The route can still open when storage is blocked.
  }
}
