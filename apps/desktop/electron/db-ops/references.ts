function parseSerializedIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
  } catch {
    return []
  }
}

export function removeSerializedIds(raw: string, removedIds: ReadonlySet<string>): string {
  const retainedIds = parseSerializedIds(raw).filter((id) => !removedIds.has(id))
  return JSON.stringify(Array.from(new Set(retainedIds)))
}

export type ShotReferenceColumn = 'character_ids' | 'prop_ids' | 'costume_ids'

type ReferenceStatement = {
  all: (...params: unknown[]) => unknown[]
  run: (...params: unknown[]) => unknown
}

type ReferenceDatabase = {
  prepare: (sql: string) => ReferenceStatement
}

export function pruneShotReferences(
  raw: ReferenceDatabase,
  column: ShotReferenceColumn,
  removedIds: ReadonlySet<string>,
  projectId?: string,
): void {
  if (removedIds.size === 0) return

  const selectSql = projectId
    ? `SELECT shots.id, shots.${column} AS references FROM shots INNER JOIN series ON series.id = shots.series_id WHERE series.project_id = ?`
    : `SELECT id, ${column} AS references FROM shots`
  const selectStatement = raw.prepare(selectSql)
  const rows = (projectId ? selectStatement.all(projectId) : selectStatement.all()) as Array<{
    id: string
    references: string
  }>
  const updateStatement = raw.prepare(`UPDATE shots SET ${column} = ? WHERE id = ?`)

  for (const row of rows) {
    const nextReferences = removeSerializedIds(row.references, removedIds)
    if (nextReferences === row.references) continue
    updateStatement.run(nextReferences, row.id)
  }
}
