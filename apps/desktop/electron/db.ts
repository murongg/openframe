import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@openframe/db'
import { getProviderById, type AIConfig } from '@openframe/providers'
import { store } from './store'
import { getDataDir } from './data_dir'
import { resolveSqliteVecExtensionPath } from './sqlite-vec'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const sqliteVec = require('sqlite-vec') as { getLoadablePath: () => string }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 打包后 migrations 放在 extraResources/migrations；开发时从源目录读取
const MIGRATIONS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'migrations')
  : path.join(__dirname, '..', 'electron', 'migrations')

const SHOTS_PRODUCTION_COLUMNS_MIGRATION_MILLIS = 1771982985060
const PROPS_TABLE_CREATE_MIGRATION_MILLIS = 1772154932545
const SHOTS_PROP_IDS_MIGRATION_MILLIS = 1772156051044
const CHARACTER_RELATIONS_TABLE_CREATE_MIGRATION_MILLIS = 1772159861848

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: InstanceType<typeof Database> | null = null

function isShotsProductionColumnsMigrationConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('production_first_frame')
    && message.includes('ALTER TABLE')
    && message.includes('shots')
  )
}

function isPropsTableCreateMigrationConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /CREATE TABLE\s+[`"]?props[`"]?/i.test(message)
}

function isShotsPropIdsMigrationConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /prop_ids/i.test(message)
    && /shots/i.test(message)
    && (/ALTER TABLE/i.test(message) || /duplicate column/i.test(message) || /NOT NULL/i.test(message))
  )
}

function isCharacterRelationsTableCreateMigrationConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /CREATE TABLE\s+[`"]?character_relations[`"]?/i.test(message)
}

function ensureShotsProductionColumns(raw: InstanceType<typeof Database>): void {
  const tableExists = raw
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get('shots')
  if (!tableExists) return

  const columns = raw.prepare("PRAGMA table_info('shots')").all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))

  if (!names.has('production_first_frame')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_first_frame text')
  }
  if (!names.has('production_last_frame')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_last_frame text')
  }
  if (!names.has('production_video')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_video text')
  }
  if (!names.has('production_first_frame_prompt_override')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_first_frame_prompt_override text')
  }
  if (!names.has('production_last_frame_prompt_override')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_last_frame_prompt_override text')
  }
  if (!names.has('production_video_prompt_override')) {
    raw.exec('ALTER TABLE shots ADD COLUMN production_video_prompt_override text')
  }
}

function ensureShotsPropIdsColumn(raw: InstanceType<typeof Database>): void {
  const tableExists = raw
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get('shots')
  if (!tableExists) return

  const columns = raw.prepare("PRAGMA table_info('shots')").all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))
  if (!names.has('prop_ids')) {
    raw.exec("ALTER TABLE shots ADD COLUMN prop_ids text NOT NULL DEFAULT '[]'")
  }
  raw.exec("UPDATE shots SET prop_ids = '[]' WHERE prop_ids IS NULL OR prop_ids = ''")
}

function ensurePropsTableColumns(raw: InstanceType<typeof Database>): void {
  const tableExists = raw
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get('props')
  if (!tableExists) return

  const columns = raw.prepare("PRAGMA table_info('props')").all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))
  if (!names.has('thumbnail')) {
    raw.exec('ALTER TABLE props ADD COLUMN thumbnail text')
  }
}

function ensureCharacterRelationsTableColumns(raw: InstanceType<typeof Database>): void {
  const tableExists = raw
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get('character_relations')
  if (!tableExists) return

  const columns = raw.prepare("PRAGMA table_info('character_relations')").all() as Array<{ name: string }>
  const names = new Set(columns.map((column) => column.name))

  if (!names.has('relation_type')) {
    raw.exec("ALTER TABLE character_relations ADD COLUMN relation_type text NOT NULL DEFAULT ''")
  }
  if (!names.has('strength')) {
    raw.exec('ALTER TABLE character_relations ADD COLUMN strength integer NOT NULL DEFAULT 3')
  }
  if (!names.has('notes')) {
    raw.exec("ALTER TABLE character_relations ADD COLUMN notes text NOT NULL DEFAULT ''")
  }
  if (!names.has('evidence')) {
    raw.exec("ALTER TABLE character_relations ADD COLUMN evidence text NOT NULL DEFAULT ''")
  }

  raw.exec('UPDATE character_relations SET strength = 3 WHERE strength IS NULL')
  raw.exec("UPDATE character_relations SET relation_type = '' WHERE relation_type IS NULL")
  raw.exec("UPDATE character_relations SET notes = '' WHERE notes IS NULL")
  raw.exec("UPDATE character_relations SET evidence = '' WHERE evidence IS NULL")
}

function markMigrationApplied(raw: InstanceType<typeof Database>, createdAt: number, hash: string): void {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  const existing = raw
    .prepare('SELECT 1 FROM "__drizzle_migrations" WHERE created_at = ? LIMIT 1')
    .get(createdAt)
  if (!existing) {
    raw
      .prepare('INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES(?, ?)')
      .run(hash, createdAt)
  }
}

function recoverShotsMigrationConflict(raw: InstanceType<typeof Database>): void {
  ensureShotsProductionColumns(raw)
  markMigrationApplied(raw, SHOTS_PRODUCTION_COLUMNS_MIGRATION_MILLIS, 'manual_hotfix_0009_shots_production_columns')
}

function recoverPropsMigrationConflict(raw: InstanceType<typeof Database>): void {
  ensurePropsTableColumns(raw)
  markMigrationApplied(raw, PROPS_TABLE_CREATE_MIGRATION_MILLIS, 'manual_hotfix_0011_props_table_exists')
}

function recoverShotsPropIdsMigrationConflict(raw: InstanceType<typeof Database>): void {
  ensureShotsPropIdsColumn(raw)
  markMigrationApplied(raw, SHOTS_PROP_IDS_MIGRATION_MILLIS, 'manual_hotfix_0012_shots_prop_ids')
}

function recoverCharacterRelationsMigrationConflict(raw: InstanceType<typeof Database>): void {
  ensureCharacterRelationsTableColumns(raw)
  markMigrationApplied(raw, CHARACTER_RELATIONS_TABLE_CREATE_MIGRATION_MILLIS, 'manual_hotfix_0013_character_relations_table_exists')
}

export function getDb() {
  if (!_db) {
    const DB_DIR = getDataDir()
    const DB_PATH = path.join(DB_DIR, 'app.db')
    fs.mkdirSync(DB_DIR, { recursive: true })
    _sqlite = new Database(DB_PATH)
    _sqlite.pragma('journal_mode = WAL')
    _sqlite.loadExtension(resolveSqliteVecExtensionPath(sqliteVec.getLoadablePath(), app.isPackaged))
    _db = drizzle(_sqlite, { schema })

    try {
      migrate(_db, { migrationsFolder: MIGRATIONS_DIR })
    } catch (error) {
      if (isShotsProductionColumnsMigrationConflict(error)) {
        recoverShotsMigrationConflict(_sqlite)
      } else if (isPropsTableCreateMigrationConflict(error)) {
        recoverPropsMigrationConflict(_sqlite)
      } else if (isShotsPropIdsMigrationConflict(error)) {
        recoverShotsPropIdsMigrationConflict(_sqlite)
      } else if (isCharacterRelationsTableCreateMigrationConflict(error)) {
        recoverCharacterRelationsMigrationConflict(_sqlite)
      } else {
        throw error
      }
      migrate(_db, { migrationsFolder: MIGRATIONS_DIR })
    }

    // Determine embedding dimension from configured model
    const cfg = store.get('ai_config') as AIConfig
    const embeddingKey = cfg.models.embedding
    let dimension = 1024  // sensible default
    if (embeddingKey) {
      const [providerId, modelId] = embeddingKey.split(':')
      const provider = getProviderById(providerId, cfg.customProviders)
      const builtinModel = provider?.models.find((m) => m.id === modelId)
      const customModel = (cfg.customModels[providerId] ?? []).find((m) => m.id === modelId)
      const model = builtinModel ?? customModel
      if (model?.dimension) dimension = model.dimension
    }

    // Recreate vec_chunks if dimension changed
    const storedDim = store.get('vec_dimension') as number
    if (storedDim !== dimension) {
      _sqlite.exec('DROP TABLE IF EXISTS vec_chunks')
      store.set('vec_dimension', dimension)
    }

    _sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        chunk_id INTEGER PRIMARY KEY,
        embedding FLOAT[${dimension}]
      )
    `)
  }
  return _db
}

export function getRawDb() {
  getDb()
  return _sqlite!
}

export function closeDb() {
  _sqlite?.close()
  _db = null
  _sqlite = null
}
