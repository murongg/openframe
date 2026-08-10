const DB_NAME = 'openframe-web'
const DB_VERSION = 3

export const STORE_NAMES = {
  genres: 'genres',
  categories: 'categories',
  projects: 'projects',
  series: 'series',
  characters: 'characters',
  characterRelations: 'character_relations',
  props: 'props',
  costumes: 'costumes',
  scenes: 'scenes',
  shots: 'shots',
  seriesSceneLinks: 'series_scene_links',
  seriesCharacterLinks: 'series_character_links',
  seriesPropLinks: 'series_prop_links',
  seriesCostumeLinks: 'series_costume_links',
  vectorDocuments: 'vector_documents',
  vectorChunks: 'vector_chunks',
} as const

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES]

export type Identifiable = { id: string | number }

export type SeriesSceneLinkRow = {
  id: string
  project_id: string
  series_id: string
  scene_id: string
  created_at: number
}

export type SeriesCharacterLinkRow = {
  id: string
  project_id: string
  series_id: string
  character_id: string
  created_at: number
}

export type SeriesPropLinkRow = {
  id: string
  project_id: string
  series_id: string
  prop_id: string
  created_at: number
}

export type SeriesCostumeLinkRow = {
  id: string
  project_id: string
  series_id: string
  costume_id: string
  created_at: number
}

export type VectorDocumentRow = {
  id: string
  title: string
  type: string
  project_id?: string
  created_at: number
}

export type VectorChunkRow = {
  id?: number
  document_id: string
  content: string
  chunk_index: number
  embedding: number[]
  created_at: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function createStoreIfMissing(
  db: IDBDatabase,
  storeName: StoreName,
  options: IDBObjectStoreParameters,
) {
  if (db.objectStoreNames.contains(storeName)) return
  db.createObjectStore(storeName, options)
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      createStoreIfMissing(db, STORE_NAMES.genres, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.categories, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.projects, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.series, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.characters, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.characterRelations, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.props, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.costumes, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.scenes, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.shots, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesSceneLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesCharacterLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesPropLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.seriesCostumeLinks, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.vectorDocuments, { keyPath: 'id' })
      createStoreIfMissing(db, STORE_NAMES.vectorChunks, { keyPath: 'id', autoIncrement: true })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
  })

  return dbPromise
}

export async function getAllRows<T extends Identifiable>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const rows = await requestToPromise(transaction.objectStore(storeName).getAll() as IDBRequest<T[]>)
  await transactionToPromise(transaction)
  return rows
}

export async function getRowById<T extends Identifiable>(
  storeName: StoreName,
  id: string | number,
): Promise<T | undefined> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const row = await requestToPromise(transaction.objectStore(storeName).get(id) as IDBRequest<T | undefined>)
  await transactionToPromise(transaction)
  return row
}

export async function putRow<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  store.put(value)
  await transactionToPromise(transaction)
}

export async function addRow<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  const key = await requestToPromise(store.add(value))
  await transactionToPromise(transaction)
  return key
}

export async function deleteRowById(storeName: StoreName, id: string | number): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).delete(id)
  await transactionToPromise(transaction)
}

export async function removeRowsWhere<T extends Identifiable>(
  storeName: StoreName,
  predicate: (row: T) => boolean,
): Promise<number> {
  const rows = await getAllRows<T>(storeName)
  const ids = rows.filter(predicate).map((row) => row.id)
  if (ids.length === 0) return 0

  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  ids.forEach((id) => {
    store.delete(id)
  })
  await transactionToPromise(transaction)
  return ids.length
}

export function sortByCreatedDesc<T extends { created_at: number }>(left: T, right: T): number {
  return right.created_at - left.created_at
}

export function sortByCreatedAsc<T extends { created_at: number }>(left: T, right: T): number {
  return left.created_at - right.created_at
}

export function sortSeriesByProjectOrder(left: SeriesRow, right: SeriesRow): number {
  return left.sort_index - right.sort_index || left.created_at - right.created_at
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

export function normalizeCharacterRow(row: CharacterRow): CharacterRow {
  return {
    ...row,
    gender: normalizeGender(row.gender),
    age: normalizeAge(row.age),
  }
}

export function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map((value) => (typeof value === 'string' ? value : '')).filter(Boolean)))
}

export function removeIds(ids: unknown, removedIds: ReadonlySet<string>): string[] {
  return normalizeIds(ids).filter((id) => !removedIds.has(id))
}

export function normalizeCostumeRow(row: CostumeRow): CostumeRow {
  return {
    ...row,
    character_ids: normalizeIds(row.character_ids),
  }
}

export function normalizeShotRow(row: ShotRow): ShotRow {
  return {
    ...row,
    character_ids: normalizeIds(row.character_ids),
    prop_ids: normalizeIds(row.prop_ids),
    costume_ids: normalizeIds((row as Partial<ShotRow>).costume_ids),
  }
}

export function buildSceneLinkId(seriesId: string, sceneId: string): string {
  return `${seriesId}::${sceneId}`
}

export function buildCharacterLinkId(seriesId: string, characterId: string): string {
  return `${seriesId}::${characterId}`
}

export function buildPropLinkId(seriesId: string, propId: string): string {
  return `${seriesId}::${propId}`
}

export function buildCostumeLinkId(seriesId: string, costumeId: string): string {
  return `${seriesId}::${costumeId}`
}
