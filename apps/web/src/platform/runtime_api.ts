import {
  isObjectStorageEnabled,
  parseObjectStorageConfig,
  type ObjectStorageConfig,
} from '@openframe/shared/object-storage-config'
import { ensureProxyFetchInstalled } from './fetch_proxy'
import { createWebAiApi } from './runtime_ai'
import {
  STORE_NAMES,
  type Identifiable,
  type SeriesSceneLinkRow,
  type SeriesCharacterLinkRow,
  type SeriesPropLinkRow,
  type SeriesCostumeLinkRow,
  type VectorDocumentRow,
  type VectorChunkRow,
  getAllRows,
  putRow,
  addRow,
  deleteRowById,
  removeRowsWhere,
} from './runtime_db'
import {
  extToMimeType,
  toDataUrl,
  uploadMediaToObjectStorage,
  readMediaAsDataUrl,
  exportMergedVideoInBrowser,
} from './runtime_media'
import {
  type ExportMergedVideoPayload,
  type ExportFcpxmlPayload,
  type ExportEdlPayload,
  pickExportClips,
  toArrayBuffer,
  buildTimelineZipBytes,
  buildEdlContent,
  buildFcpxmlContent,
  downloadBlobAsFile,
} from './runtime_timeline'
import {
  SETTINGS_KEYS,
  type AllowedSettingKey,
  VECTOR_DIMENSION_KEY,
  DATA_DIR_KEY,
  DEFAULT_DATA_DIR,
  getSettingStorageKey,
  localGet,
  localSet,
  localDelete,
  getStoredSetting,
  getCurrentAIConfig,
  saveCurrentAIConfig,
} from './runtime_state'
import { resolveWebAppVersion } from './runtime_version'
import { registerProjectApis } from './project_apis'

function cosineDistance(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return Number.POSITIVE_INFINITY

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    dot += leftValue * rightValue
    leftNorm += leftValue * leftValue
    rightNorm += rightValue * rightValue
  }

  if (leftNorm === 0 || rightNorm === 0) return Number.POSITIVE_INFINITY
  const cosine = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
  return 1 - cosine
}

function estimateTextBytes(value: string): number {
  return new Blob([value]).size
}

function maybeDataUrlSize(value: string | null | undefined): number {
  if (!value || !/^data:/i.test(value)) return 0
  return estimateTextBytes(value)
}

const STORAGE_TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5x8AAAAASUVORK5CYII='

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function getDataInfo(): Promise<DataInfo> {
  const [
    genres,
    projects,
    series,
    characters,
    characterRelations,
    props,
    costumes,
    scenes,
    shots,
    sceneLinks,
    characterLinks,
    propLinks,
    costumeLinks,
    vectorDocuments,
    vectorChunks,
  ] = await Promise.all([
    getAllRows<GenreRow>(STORE_NAMES.genres),
    getAllRows<ProjectRow>(STORE_NAMES.projects),
    getAllRows<SeriesRow>(STORE_NAMES.series),
    getAllRows<CharacterRow>(STORE_NAMES.characters),
    getAllRows<CharacterRelationRow>(STORE_NAMES.characterRelations),
    getAllRows<PropRow>(STORE_NAMES.props),
    getAllRows<CostumeRow>(STORE_NAMES.costumes),
    getAllRows<SceneRow>(STORE_NAMES.scenes),
    getAllRows<ShotRow>(STORE_NAMES.shots),
    getAllRows<SeriesSceneLinkRow>(STORE_NAMES.seriesSceneLinks),
    getAllRows<SeriesCharacterLinkRow>(STORE_NAMES.seriesCharacterLinks),
    getAllRows<SeriesPropLinkRow>(STORE_NAMES.seriesPropLinks),
    getAllRows<SeriesCostumeLinkRow>(STORE_NAMES.seriesCostumeLinks),
    getAllRows<VectorDocumentRow>(STORE_NAMES.vectorDocuments),
    getAllRows<VectorChunkRow & Identifiable>(STORE_NAMES.vectorChunks),
  ])

  let thumbsSize = 0
  let videosSize = 0

  const addThumb = (value: string | null | undefined) => {
    thumbsSize += maybeDataUrlSize(value)
  }
  const addVideo = (value: string | null | undefined) => {
    videosSize += maybeDataUrlSize(value)
  }

  genres.forEach((row) => addThumb(row.thumbnail))
  projects.forEach((row) => addThumb(row.thumbnail))
  series.forEach((row) => addThumb(row.thumbnail))
  characters.forEach((row) => addThumb(row.thumbnail))
  props.forEach((row) => addThumb(row.thumbnail))
  costumes.forEach((row) => addThumb(row.thumbnail))
  scenes.forEach((row) => addThumb(row.thumbnail))
  shots.forEach((row) => {
    addThumb(row.thumbnail)
    addThumb(row.production_first_frame)
    addThumb(row.production_last_frame)
    addVideo(row.production_video)
  })

  const dbSize = [
    ...genres,
    ...projects,
    ...series,
    ...characters,
    ...characterRelations,
    ...props,
    ...costumes,
    ...scenes,
    ...shots,
    ...sceneLinks,
    ...characterLinks,
    ...propLinks,
    ...costumeLinks,
    ...vectorDocuments,
    ...vectorChunks,
  ].reduce((total, row) => total + estimateTextBytes(JSON.stringify(row)), 0)

  const currentDir = localGet(DATA_DIR_KEY) || DEFAULT_DATA_DIR

  return {
    defaultDir: DEFAULT_DATA_DIR,
    currentDir,
    pendingDir: '',
    dbSize,
    thumbsSize,
    videosSize,
  }
}

export function ensureWebRuntimeAPIs(): void {
  const runtimeWindow = window as Window

  if (runtimeWindow.settingsAPI && runtimeWindow.projectsAPI) return
  ensureProxyFetchInstalled()

  runtimeWindow.settingsAPI = {
    getAll: async () =>
      SETTINGS_KEYS.map((key) => ({
        key,
        value: getStoredSetting(key),
      })),
    upsert: async (key: string, value: string) => {
      if (!SETTINGS_KEYS.includes(key as AllowedSettingKey)) return
      localSet(getSettingStorageKey(key as AllowedSettingKey), value)
    },
    delete: async (key: string) => {
      if (!SETTINGS_KEYS.includes(key as AllowedSettingKey)) return
      localDelete(getSettingStorageKey(key as AllowedSettingKey))
    },
  }

  runtimeWindow.thumbnailsAPI = {
    save: async (data: Uint8Array, ext: string, folder?: 'thumbnails' | 'videos') => {
      const storageConfig = parseObjectStorageConfig(getStoredSetting('storage_config'))
      if (isObjectStorageEnabled(storageConfig)) {
        return uploadMediaToObjectStorage({ data, ext, folder, config: storageConfig })
      }
      const mimeType = extToMimeType(ext, folder)
      return toDataUrl(data, mimeType)
    },
    delete: async () => {
      // data URLs are embedded in records; no separate file cleanup required
    },
    readBase64: async (filepath: string) => readMediaAsDataUrl(filepath),
  }


  registerProjectApis(runtimeWindow)

  runtimeWindow.windowAPI = {
    openStudio: async (payload: { projectId: string; seriesId: string }) => {
      const nextHash = `#/projects/${encodeURIComponent(payload.projectId)}?studio=1&seriesId=${encodeURIComponent(payload.seriesId)}`
      window.location.hash = nextHash
    },
    openExternal: async (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    getVersion: async () => resolveWebAppVersion(),
  }

  runtimeWindow.mediaAPI = {
    autoEdit: async (payload) => {
      const first = payload.clips[0]?.path
      if (!first) throw new Error('No clip available for auto edit')
      return { outputPath: first }
    },
    exportMergedVideo: async (payload: ExportMergedVideoPayload) => {
      return exportMergedVideoInBrowser(payload)
    },
    exportFcpxml: async (payload: ExportFcpxmlPayload) => {
      const runId = Date.now().toString(36)
      const selectedClips = pickExportClips(payload)
      const timelineFilename = `timeline_${runId}.fcpxml`
      const zipFilename = `timeline_${runId}.zip`
      const content = buildFcpxmlContent(payload)
      const zipBytes = await buildTimelineZipBytes({
        timelineFilename,
        timelineContent: content,
        selectedClips,
      })
      downloadBlobAsFile(
        new Blob([toArrayBuffer(zipBytes)], { type: 'application/zip' }),
        zipFilename,
      )
      return { outputPath: zipFilename }
    },
    exportEdl: async (payload: ExportEdlPayload) => {
      const runId = Date.now().toString(36)
      const selectedClips = pickExportClips(payload)
      const timelineFilename = `timeline_${runId}.edl`
      const zipFilename = `timeline_${runId}.zip`
      const content = buildEdlContent(payload)
      const zipBytes = await buildTimelineZipBytes({
        timelineFilename,
        timelineContent: content,
        selectedClips,
      })
      downloadBlobAsFile(
        new Blob([toArrayBuffer(zipBytes)], { type: 'application/zip' }),
        zipFilename,
      )
      return { outputPath: zipFilename }
    },
  }

  runtimeWindow.aiAPI = createWebAiApi({
    getCurrentAIConfig,
    saveAIConfig: saveCurrentAIConfig,
  })

  runtimeWindow.vectorsAPI = {
    getDimension: async () => {
      const value = Number(localGet(VECTOR_DIMENSION_KEY) || '0')
      return Number.isFinite(value) ? value : 0
    },
    insertDocument: async (doc: { id: string; title: string; type: string; project_id?: string }) => {
      await putRow(STORE_NAMES.vectorDocuments, {
        ...doc,
        created_at: Math.floor(Date.now() / 1000),
      } satisfies VectorDocumentRow)
    },
    insertChunk: async (chunk: {
      document_id: string
      content: string
      chunk_index: number
      embedding: number[]
    }) => {
      const key = await addRow(STORE_NAMES.vectorChunks, {
        document_id: chunk.document_id,
        content: chunk.content,
        chunk_index: chunk.chunk_index,
        embedding: chunk.embedding,
        created_at: Math.floor(Date.now() / 1000),
      } satisfies VectorChunkRow)

      localSet(VECTOR_DIMENSION_KEY, String(chunk.embedding.length))

      if (typeof key === 'number') return key
      return Number(key)
    },
    search: async (params: { embedding: number[]; limit?: number; document_id?: string }) => {
      const rows = await getAllRows<(VectorChunkRow & Identifiable)>(STORE_NAMES.vectorChunks)
      const filtered = params.document_id
        ? rows.filter((row) => row.document_id === params.document_id)
        : rows

      const scored = filtered
        .map((row) => ({
          chunk_id: Number(row.id),
          document_id: row.document_id,
          content: row.content,
          chunk_index: row.chunk_index,
          distance: cosineDistance(params.embedding, row.embedding),
        }))
        .filter((row) => Number.isFinite(row.distance))
        .sort((left, right) => left.distance - right.distance)

      const limit = Math.max(1, params.limit ?? 5)
      return scored.slice(0, limit)
    },
    deleteDocument: async (documentId: string) => {
      await Promise.all([
        deleteRowById(STORE_NAMES.vectorDocuments, documentId),
        removeRowsWhere<(VectorChunkRow & Identifiable)>(
          STORE_NAMES.vectorChunks,
          (row) => row.document_id === documentId,
        ),
      ])
    },
  }

  runtimeWindow.dataAPI = {
    getInfo: async () => getDataInfo(),
    cleanupUnusedMedia: async () => ({
      removedImages: 0,
      removedVideos: 0,
      freedBytes: 0,
    }),
    testObjectStorage: async (config: ObjectStorageConfig) => {
      try {
        if (!isObjectStorageEnabled(config)) {
          return { ok: false, error: 'Object storage is not configured' }
        }
        const url = await uploadMediaToObjectStorage({
          data: decodeBase64ToBytes(STORAGE_TEST_IMAGE_BASE64),
          ext: 'png',
          folder: 'thumbnails',
          config,
        })
        return { ok: true, url }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message || 'Upload failed' }
      }
    },
    selectDirectory: async () => null,
    setDirectory: async (dir: string) => {
      localSet(DATA_DIR_KEY, dir || DEFAULT_DATA_DIR)
    },
    resetDirectory: async () => {
      localDelete(DATA_DIR_KEY)
    },
    openDirectory: async () => undefined,
    restart: async () => {
      window.location.reload()
    },
  }
}
