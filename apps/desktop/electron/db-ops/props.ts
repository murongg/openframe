import { getRawDb } from '../db'
import { pruneShotReferences } from './references'
import { runInTransaction } from './tx'

export type PropRow = {
  id: string
  project_id: string
  name: string
  category: string
  description: string
  thumbnail: string | null
  created_at: number
}

export type PropSeriesLink = {
  project_id: string
  series_id: string
  prop_id: string
  created_at: number
}

export function ensurePropsSchema(): void {
  const raw = getRawDb()
  raw.exec(
    "CREATE TABLE IF NOT EXISTS props (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, name text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', thumbnail text, created_at integer NOT NULL)",
  )

  try {
    raw.exec('ALTER TABLE props ADD COLUMN thumbnail text')
  } catch {
    // ignore when column already exists
  }

  raw.exec(
    'CREATE TABLE IF NOT EXISTS series_prop_links (project_id text NOT NULL, series_id text NOT NULL, prop_id text NOT NULL, created_at integer NOT NULL, PRIMARY KEY (series_id, prop_id))',
  )

  // Prefer shot-derived links; fallback to linking all project props to each series.
  const shotColumns = raw.prepare("PRAGMA table_info('shots')").all() as Array<{ name: string }>
  const hasPropIds = shotColumns.some((column) => column.name === 'prop_ids')
  if (hasPropIds) {
    raw.exec(`
      INSERT OR IGNORE INTO series_prop_links (project_id, series_id, prop_id, created_at)
      SELECT series.project_id, shots.series_id, json_each.value, shots.created_at
      FROM shots
      INNER JOIN series ON series.id = shots.series_id
      INNER JOIN json_each(CASE WHEN json_valid(shots.prop_ids) THEN shots.prop_ids ELSE '[]' END)
      WHERE json_each.value IS NOT NULL
        AND json_each.value <> ''
    `)
  }
}

export function getAllProps(): PropRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, project_id, name, category, description, thumbnail, created_at FROM props ORDER BY created_at DESC',
    )
    .all() as PropRow[]
}

export function getPropsByProject(projectId: string): PropRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      'SELECT id, project_id, name, category, description, thumbnail, created_at FROM props WHERE project_id = ? ORDER BY created_at ASC',
    )
    .all(projectId) as PropRow[]
}

export function getPropsBySeries(seriesId: string): PropRow[] {
  const raw = getRawDb()
  return raw
    .prepare(
      `SELECT p.id, p.project_id, p.name, p.category, p.description, p.thumbnail, p.created_at
      FROM props p
      INNER JOIN series_prop_links l ON l.prop_id = p.id
      WHERE l.series_id = ?
      ORDER BY p.created_at ASC`,
    )
    .all(seriesId) as PropRow[]
}

export function insertProp(prop: PropRow): void {
  runInTransaction((raw) => {
    raw
      .prepare(
        'INSERT OR REPLACE INTO props (id, project_id, name, category, description, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        prop.id,
        prop.project_id,
        prop.name,
        prop.category,
        prop.description,
        prop.thumbnail,
        prop.created_at,
      )
  })
}

export function updateProp(prop: PropRow): void {
  const raw = getRawDb()
  raw
    .prepare(
      'UPDATE props SET name = ?, category = ?, description = ?, thumbnail = ? WHERE id = ?',
    )
    .run(
      prop.name,
      prop.category,
      prop.description,
      prop.thumbnail,
      prop.id,
    )
}

export function replacePropsByProject(payload: { projectId: string; props: PropRow[] }): void {
  runInTransaction((raw) => {
    const existingRows = raw
      .prepare('SELECT id FROM props WHERE project_id = ?')
      .all(payload.projectId) as Array<{ id: string }>
    const nextIds = new Set(payload.props.map((prop) => prop.id))
    const removedIds = new Set(existingRows.map((row) => row.id).filter((id) => !nextIds.has(id)))

    raw.prepare('DELETE FROM series_prop_links WHERE project_id = ?').run(payload.projectId)
    raw.prepare('DELETE FROM props WHERE project_id = ?').run(payload.projectId)
    const insertStmt = raw.prepare(
      'INSERT INTO props (id, project_id, name, category, description, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const prop of payload.props) {
      insertStmt.run(
        prop.id,
        payload.projectId,
        prop.name,
        prop.category,
        prop.description,
        prop.thumbnail,
        prop.created_at,
      )
    }

    pruneShotReferences(raw, 'prop_ids', removedIds, payload.projectId)
  })
}

export function replacePropsBySeries(payload: { projectId: string; seriesId: string; props: PropRow[] }): void {
  runInTransaction((raw) => {
    const upsertStmt = raw.prepare(
      'INSERT OR REPLACE INTO props (id, project_id, name, category, description, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const prop of payload.props) {
      upsertStmt.run(
        prop.id,
        payload.projectId,
        prop.name,
        prop.category,
        prop.description,
        prop.thumbnail,
        prop.created_at,
      )
    }

    raw
      .prepare('DELETE FROM series_prop_links WHERE project_id = ? AND series_id = ?')
      .run(payload.projectId, payload.seriesId)
    const linkStmt = raw.prepare(
      'INSERT OR REPLACE INTO series_prop_links (project_id, series_id, prop_id, created_at) VALUES (?, ?, ?, ?)',
    )
    const now = Date.now()
    for (const prop of payload.props) {
      linkStmt.run(payload.projectId, payload.seriesId, prop.id, now)
    }
  })
}

export function linkPropToSeries(payload: PropSeriesLink): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT OR REPLACE INTO series_prop_links (project_id, series_id, prop_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(payload.project_id, payload.series_id, payload.prop_id, payload.created_at)
}

export function unlinkPropFromSeries(payload: { seriesId: string; propId: string }): void {
  const raw = getRawDb()
  raw
    .prepare('DELETE FROM series_prop_links WHERE series_id = ? AND prop_id = ?')
    .run(payload.seriesId, payload.propId)
}

export function deleteProp(id: string): void {
  runInTransaction((raw) => {
    raw.prepare('DELETE FROM series_prop_links WHERE prop_id = ?').run(id)
    raw.prepare('DELETE FROM props WHERE id = ?').run(id)
    pruneShotReferences(raw, 'prop_ids', new Set([id]))
  })
}
