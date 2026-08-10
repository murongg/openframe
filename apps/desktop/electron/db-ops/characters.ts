import { getRawDb } from '../db'
import { pruneShotReferences } from './references'
import { runInTransaction } from './tx'

export type CharacterRow = {
  id: string
  project_id: string
  name: string
  gender: string
  age: string
  personality: string
  thumbnail: string | null
  appearance: string
  background: string
  created_at: number
}

export type CharacterSeriesLink = {
  project_id: string
  series_id: string
  character_id: string
  created_at: number
}

function normalizeAge(value: string): CharacterRow['age'] {
  const raw = (value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (raw === '幼年' || lower === 'child') return 'child'
  if (raw === '少年' || lower === 'youth' || lower === 'teen') return 'youth'
  if (raw === '青年' || lower === 'young_adult' || lower === 'young adult') return 'young_adult'
  if (raw === '成年' || lower === 'adult') return 'adult'
  if (raw === '中年' || lower === 'middle_aged' || lower === 'middle-aged') return 'middle_aged'
  if (raw === '老年' || lower === 'elder') return 'elder'
  return ''
}

function normalizeGender(value: string): CharacterRow['gender'] {
  const raw = (value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (raw === '男' || lower === 'male') return 'male'
  if (raw === '女' || lower === 'female') return 'female'
  if (raw === '其他' || lower === 'other') return 'other'
  return ''
}

function normalizeCharacterRow(row: CharacterRow): CharacterRow {
  return {
    ...row,
    gender: normalizeGender(row.gender),
    age: normalizeAge(row.age),
  }
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

function removeCharacterReferencesFromCostumes(
  raw: ReturnType<typeof getRawDb>,
  projectId: string,
  removedCharacterIds: Set<string>,
): void {
  if (removedCharacterIds.size === 0) return
  const costumesTableExists = Boolean(
    raw
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get('costumes'),
  )
  if (!costumesTableExists) return

  const rows = raw
    .prepare('SELECT id, character_ids FROM costumes WHERE project_id = ?')
    .all(projectId) as Array<{ id: string; character_ids: string }>
  const updateStmt = raw.prepare('UPDATE costumes SET character_ids = ? WHERE id = ?')
  for (const row of rows) {
    const currentIds = parseIds(row.character_ids)
    const nextIds = currentIds.filter((id) => !removedCharacterIds.has(id))
    if (nextIds.length === currentIds.length) continue
    updateStmt.run(toSqlIds(nextIds), row.id)
  }
}

export function ensureCharactersSchema(): void {
  const raw = getRawDb()
  raw.exec(
    'CREATE TABLE IF NOT EXISTS characters (id text PRIMARY KEY NOT NULL, project_id text NOT NULL, name text NOT NULL DEFAULT \'\', gender text NOT NULL DEFAULT \'\', age text NOT NULL DEFAULT \'\', personality text NOT NULL DEFAULT \'\', appearance text NOT NULL DEFAULT \'\', background text NOT NULL DEFAULT \'\', created_at integer NOT NULL)',
  )
  try {
    raw.exec('ALTER TABLE characters ADD COLUMN thumbnail text')
  } catch {
    // ignore when column already exists
  }

  raw.exec(
    'CREATE TABLE IF NOT EXISTS series_character_links (project_id text NOT NULL, series_id text NOT NULL, character_id text NOT NULL, created_at integer NOT NULL, PRIMARY KEY (series_id, character_id))',
  )

  const rows = raw
    .prepare('SELECT id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at FROM characters')
    .all() as CharacterRow[]
  const updateStmt = raw.prepare('UPDATE characters SET gender = ?, age = ? WHERE id = ?')
  for (const row of rows) {
    const next = normalizeCharacterRow(row)
    if (next.gender !== row.gender || next.age !== row.age) {
      updateStmt.run(next.gender, next.age, row.id)
    }
  }

  const shotsTableExists = Boolean(
    raw
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get('shots'),
  )

  // Prefer shot-derived links; fallback to linking all project characters to each series.
  if (shotsTableExists) {
    raw.exec(`
      INSERT OR IGNORE INTO series_character_links (project_id, series_id, character_id, created_at)
      SELECT series.project_id, shots.series_id, json_each.value, shots.created_at
      FROM shots
      INNER JOIN series ON series.id = shots.series_id
      INNER JOIN json_each(CASE WHEN json_valid(shots.character_ids) THEN shots.character_ids ELSE '[]' END)
      WHERE json_each.value IS NOT NULL
        AND json_each.value <> ''
    `)
  }
}

export function getAllCharacters(): CharacterRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at FROM characters ORDER BY created_at DESC',
    )
    .all() as CharacterRow[]
  return rows.map(normalizeCharacterRow)
}

export function getCharactersByProject(projectId: string): CharacterRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      'SELECT id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at FROM characters WHERE project_id = ? ORDER BY created_at ASC',
    )
    .all(projectId) as CharacterRow[]
  return rows.map(normalizeCharacterRow)
}

export function getCharactersBySeries(seriesId: string): CharacterRow[] {
  const raw = getRawDb()
  const rows = raw
    .prepare(
      `SELECT c.id, c.project_id, c.name, c.gender, c.age, c.personality, c.thumbnail, c.appearance, c.background, c.created_at
      FROM characters c
      INNER JOIN series_character_links l ON l.character_id = c.id
      WHERE l.series_id = ?
      ORDER BY c.created_at ASC`,
    )
    .all(seriesId) as CharacterRow[]
  return rows.map(normalizeCharacterRow)
}

export function insertCharacter(character: CharacterRow): void {
  runInTransaction((raw) => {
    const next = normalizeCharacterRow(character)
    raw
      .prepare(
        'INSERT OR REPLACE INTO characters (id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        next.id,
        next.project_id,
        next.name,
        next.gender,
        next.age,
        next.personality,
        next.thumbnail,
        next.appearance,
        next.background,
        next.created_at,
      )
  })
}

export function updateCharacter(character: CharacterRow): void {
  const raw = getRawDb()
  const next = normalizeCharacterRow(character)
  raw
    .prepare(
      'UPDATE characters SET name = ?, gender = ?, age = ?, personality = ?, thumbnail = ?, appearance = ?, background = ? WHERE id = ?',
    )
    .run(
      next.name,
      next.gender,
      next.age,
      next.personality,
      next.thumbnail,
      next.appearance,
      next.background,
      next.id,
    )
}

export function replaceCharactersByProject(payload: { projectId: string; characters: CharacterRow[] }): void {
  runInTransaction((raw) => {
    const existingRows = raw
      .prepare('SELECT id FROM characters WHERE project_id = ?')
      .all(payload.projectId) as Array<{ id: string }>
    const nextIds = new Set(payload.characters.map((character) => character.id))
    const removedIds = new Set(
      existingRows
        .map((row) => row.id)
        .filter((id) => !nextIds.has(id)),
    )

    raw.prepare('DELETE FROM series_character_links WHERE project_id = ?').run(payload.projectId)
    raw.prepare('DELETE FROM characters WHERE project_id = ?').run(payload.projectId)
    const insertStmt = raw.prepare(
      'INSERT INTO characters (id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const character of payload.characters) {
      const next = normalizeCharacterRow(character)
      insertStmt.run(
        next.id,
        payload.projectId,
        next.name,
        next.gender,
        next.age,
        next.personality,
        next.thumbnail,
        next.appearance,
        next.background,
        next.created_at,
      )
    }

    removeCharacterReferencesFromCostumes(raw, payload.projectId, removedIds)
    pruneShotReferences(raw, 'character_ids', removedIds, payload.projectId)
    const deleteRelationStmt = raw.prepare(
      'DELETE FROM character_relations WHERE source_character_id = ? OR target_character_id = ?',
    )
    for (const id of removedIds) {
      deleteRelationStmt.run(id, id)
    }
  })
}

export function replaceCharactersBySeries(payload: { projectId: string; seriesId: string; characters: CharacterRow[] }): void {
  runInTransaction((raw) => {
    const upsertStmt = raw.prepare(
      'INSERT OR REPLACE INTO characters (id, project_id, name, gender, age, personality, thumbnail, appearance, background, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const character of payload.characters) {
      const next = normalizeCharacterRow(character)
      upsertStmt.run(
        next.id,
        payload.projectId,
        next.name,
        next.gender,
        next.age,
        next.personality,
        next.thumbnail,
        next.appearance,
        next.background,
        next.created_at,
      )
    }

    raw
      .prepare('DELETE FROM series_character_links WHERE project_id = ? AND series_id = ?')
      .run(payload.projectId, payload.seriesId)
    const linkStmt = raw.prepare(
      'INSERT OR REPLACE INTO series_character_links (project_id, series_id, character_id, created_at) VALUES (?, ?, ?, ?)',
    )
    const now = Date.now()
    for (const character of payload.characters) {
      linkStmt.run(payload.projectId, payload.seriesId, character.id, now)
    }
  })
}

export function linkCharacterToSeries(payload: CharacterSeriesLink): void {
  const raw = getRawDb()
  raw
    .prepare(
      'INSERT OR REPLACE INTO series_character_links (project_id, series_id, character_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(payload.project_id, payload.series_id, payload.character_id, payload.created_at)
}

export function unlinkCharacterFromSeries(payload: { seriesId: string; characterId: string }): void {
  const raw = getRawDb()
  raw
    .prepare('DELETE FROM series_character_links WHERE series_id = ? AND character_id = ?')
    .run(payload.seriesId, payload.characterId)
}

export function deleteCharacter(id: string): void {
  runInTransaction((raw) => {
    const row = raw
      .prepare('SELECT project_id FROM characters WHERE id = ?')
      .get(id) as { project_id: string } | undefined
    raw.prepare('DELETE FROM series_character_links WHERE character_id = ?').run(id)
    raw.prepare('DELETE FROM characters WHERE id = ?').run(id)
    raw
      .prepare('DELETE FROM character_relations WHERE source_character_id = ? OR target_character_id = ?')
      .run(id, id)
    pruneShotReferences(raw, 'character_ids', new Set([id]), row?.project_id)
    if (row?.project_id) {
      removeCharacterReferencesFromCostumes(raw, row.project_id, new Set([id]))
    }
  })
}
