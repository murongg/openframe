import { getRawDb } from '../db'
import { pruneShotReferences } from './references'
import { runInTransaction } from './tx'

export type CostumeRow = {
  id: string
  project_id: string
  name: string
  category: string
  description: string
  character_ids: string[]
  thumbnail: string | null
  created_at: number
}

type CostumeSqlRow = Omit<CostumeRow, 'character_ids'> & { character_ids: string }

export type CostumeSeriesLink = {
  project_id: string
  series_id: string
  costume_id: string
  created_at: number
}

function parseIds(rawValue: string): string[] {
  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []
    return parsed.map((value) => (typeof value === 'string' ? value : '')).filter(Boolean)
  } catch {
    return []
  }
}

function toSqlIds(ids: string[]): string {
  return JSON.stringify(Array.from(new Set(ids.filter(Boolean))))
}

function normalizeCostumeRow(row: CostumeRow): CostumeRow {
  return {
    ...row,
    character_ids: Array.from(new Set(row.character_ids.filter(Boolean))),
  }
}

function fromSql(row: CostumeSqlRow): CostumeRow {
  return normalizeCostumeRow({
    ...row,
    character_ids: parseIds(row.character_ids),
  })
}

export function ensureCostumesSchema(): void {
  const raw = getRawDb()
  raw.exec(
    "CREATE TABLE IF NOT EXISTS costumes (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, name text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', character_ids text NOT NULL DEFAULT '[]', thumbnail text, created_at integer NOT NULL)",
  )

  try {
    raw.exec('ALTER TABLE costumes ADD COLUMN thumbnail text')
  } catch {
    // ignore when column already exists
  }

  try {
    raw.exec("ALTER TABLE costumes ADD COLUMN character_ids text NOT NULL DEFAULT '[]'")
  } catch {
    // ignore when column already exists
  }

  raw.exec(
    'CREATE TABLE IF NOT EXISTS series_costume_links (project_id text NOT NULL, series_id text NOT NULL, costume_id text NOT NULL, created_at integer NOT NULL, PRIMARY KEY (series_id, costume_id))',
  )

  const rows = raw
    .prepare('SELECT id, project_id, name, category, description, character_ids, thumbnail, created_at FROM costumes')
    .all() as CostumeSqlRow[]
  const updateStmt = raw.prepare('UPDATE costumes SET character_ids = ? WHERE id = ?')
  for (const row of rows) {
    const normalized = fromSql(row)
    const nextCharacterIds = toSqlIds(normalized.character_ids)
    if (nextCharacterIds !== row.character_ids) {
      updateStmt.run(nextCharacterIds, row.id)
    }
  }
}

export function getAllCostumes(): CostumeRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, project_id, name, category, description, character_ids, thumbnail, created_at FROM costumes ORDER BY created_at DESC',
    )
    .all() as CostumeSqlRow[]
  return rows.map(fromSql)
}

export function getCostumesByProject(projectId: string): CostumeRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, project_id, name, category, description, character_ids, thumbnail, created_at FROM costumes WHERE project_id = ? ORDER BY created_at ASC',
    )
    .all(projectId) as CostumeSqlRow[]
  return rows.map(fromSql)
}

export function getCostumesBySeries(seriesId: string): CostumeRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      `SELECT c.id, c.project_id, c.name, c.category, c.description, c.character_ids, c.thumbnail, c.created_at
      FROM costumes c
      INNER JOIN series_costume_links l ON l.costume_id = c.id
      WHERE l.series_id = ?
      ORDER BY c.created_at ASC`,
    )
    .all(seriesId) as CostumeSqlRow[]
  return rows.map(fromSql)
}

export function insertCostume(costume: CostumeRow): void {
  runInTransaction((raw) => {
    const next = normalizeCostumeRow(costume)
    raw
      .prepare(
        'INSERT OR REPLACE INTO costumes (id, project_id, name, category, description, character_ids, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        next.id,
        next.project_id,
        next.name,
        next.category,
        next.description,
        toSqlIds(next.character_ids),
        next.thumbnail,
        next.created_at,
      )
  })
}

export function updateCostume(costume: CostumeRow): void {
  const raw = getRawDb()
  const next = normalizeCostumeRow(costume)
  raw
    .prepare(
      'UPDATE costumes SET name = ?, category = ?, description = ?, character_ids = ?, thumbnail = ? WHERE id = ?',
    )
    .run(
      next.name,
      next.category,
      next.description,
      toSqlIds(next.character_ids),
      next.thumbnail,
      next.id,
    )
}

export function replaceCostumesByProject(payload: { projectId: string; costumes: CostumeRow[] }): void {
  runInTransaction((raw) => {
    const existingRows = raw
      .prepare('SELECT id FROM costumes WHERE project_id = ?')
      .all(payload.projectId) as Array<{ id: string }>
    const nextIds = new Set(payload.costumes.map((costume) => costume.id))
    const removedIds = new Set(existingRows.map((row) => row.id).filter((id) => !nextIds.has(id)))

    raw.prepare('DELETE FROM series_costume_links WHERE project_id = ?').run(payload.projectId)
    raw.prepare('DELETE FROM costumes WHERE project_id = ?').run(payload.projectId)
    const insertStmt = raw.prepare(
      'INSERT INTO costumes (id, project_id, name, category, description, character_ids, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const costume of payload.costumes) {
      const next = normalizeCostumeRow(costume)
      insertStmt.run(
        next.id,
        payload.projectId,
        next.name,
        next.category,
        next.description,
        toSqlIds(next.character_ids),
        next.thumbnail,
        next.created_at,
      )
    }

    pruneShotReferences(raw, 'costume_ids', removedIds, payload.projectId)
  })
}

export function replaceCostumesBySeries(payload: { projectId: string; seriesId: string; costumes: CostumeRow[] }): void {
  runInTransaction((raw) => {
    const upsertStmt = raw.prepare(
      'INSERT OR REPLACE INTO costumes (id, project_id, name, category, description, character_ids, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const costume of payload.costumes) {
      const next = normalizeCostumeRow(costume)
      upsertStmt.run(
        next.id,
        payload.projectId,
        next.name,
        next.category,
        next.description,
        toSqlIds(next.character_ids),
        next.thumbnail,
        next.created_at,
      )
    }

    raw
      .prepare('DELETE FROM series_costume_links WHERE project_id = ? AND series_id = ?')
      .run(payload.projectId, payload.seriesId)
    const linkStmt = raw.prepare(
      'INSERT OR REPLACE INTO series_costume_links (project_id, series_id, costume_id, created_at) VALUES (?, ?, ?, ?)',
    )
    const now = Date.now()
    for (const costume of payload.costumes) {
      linkStmt.run(payload.projectId, payload.seriesId, costume.id, now)
    }
  })
}

export function linkCostumeToSeries(payload: CostumeSeriesLink): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT OR REPLACE INTO series_costume_links (project_id, series_id, costume_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(payload.project_id, payload.series_id, payload.costume_id, payload.created_at)
}

export function unlinkCostumeFromSeries(payload: { seriesId: string; costumeId: string }): void {
  const raw = getRawDb()
  raw
    .prepare('DELETE FROM series_costume_links WHERE series_id = ? AND costume_id = ?')
    .run(payload.seriesId, payload.costumeId)
}

export function deleteCostume(id: string): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM series_costume_links WHERE costume_id = ?').run(id)
    raw.prepare('DELETE FROM costumes WHERE id = ?').run(id)
    pruneShotReferences(raw, 'costume_ids', new Set([id]))
  })
}
