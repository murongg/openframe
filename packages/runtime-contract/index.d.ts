type GenreRow = { id: string; name: string; code: string; description: string; prompt: string; thumbnail: string | null; created_at: number }
type CategoryRow = { id: string; name: string; code: string; created_at: number }
type ProjectRow = {
  id: string
  name: string
  video_ratio: '16:9' | '9:16'
  thumbnail: string | null
  category: string
  genre: string
  series_count: number
  created_at: number
}
type SeriesRow = {
  id: string
  project_id: string
  title: string
  script: string
  sort_index: number
  thumbnail: string | null
  duration: number
  created_at: number
}
type CharacterRow = {
  id: string
  project_id: string
  name: string
  gender: '' | 'male' | 'female' | 'other'
  age: '' | 'child' | 'youth' | 'young_adult' | 'adult' | 'middle_aged' | 'elder'
  personality: string
  thumbnail: string | null
  appearance: string
  background: string
  created_at: number
}
type CharacterRelationRow = {
  id: string
  project_id: string
  source_character_id: string
  target_character_id: string
  relation_type: string
  strength: number
  notes: string
  evidence: string
  created_at: number
}
type PropRow = {
  id: string
  project_id: string
  name: string
  category: string
  description: string
  thumbnail: string | null
  created_at: number
}
type CostumeRow = {
  id: string
  project_id: string
  name: string
  category: string
  description: string
  character_ids: string[]
  thumbnail: string | null
  created_at: number
}
type SceneRow = {
  id: string
  series_id?: string
  project_id: string
  title: string
  location: string
  time: string
  mood: string
  description: string
  shot_notes: string
  thumbnail: string | null
  created_at: number
}
type ShotRow = {
  id: string
  series_id: string
  scene_id: string
  title: string
  shot_index: number
  shot_size: string
  camera_angle: string
  camera_move: string
  duration_sec: number
  action: string
  dialogue: string
  character_ids: string[]
  prop_ids: string[]
  costume_ids: string[]
  thumbnail: string | null
  production_first_frame: string | null
  production_last_frame: string | null
  production_video: string | null
  production_first_frame_prompt_override: string | null
  production_last_frame_prompt_override: string | null
  production_video_prompt_override: string | null
  created_at: number
}
type ChunkSearchResult = { chunk_id: number; document_id: string; content: string; chunk_index: number; distance: number }
type DataInfo = {
  defaultDir: string
  currentDir: string
  pendingDir: string
  dbSize: number
  thumbsSize: number
  videosSize: number
}
type ObjectStorageConfig = {
  provider: 'local' | 's3' | 'oss' | 'cos'
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  pathPrefix: string
  publicBaseUrl: string
  forcePathStyle: boolean
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  aiAPI: {
    getConfig: () => Promise<unknown>
    saveConfig: (config: unknown) => Promise<void>
    testConnection: (params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string }) => Promise<{ ok: boolean; error?: string }>
    embed: (text: string) => Promise<number[] | null>
    embedBatch: (texts: string[]) => Promise<number[][] | null>
    generateImage: (params: {
      prompt: string | { text?: string; images: Array<string | number[]> }
      modelKey?: string
      options?: { size?: string; ratio?: string }
    }) => Promise<{ ok: true; data: number[]; mediaType: string; url?: string } | { ok: false; error: string }>
    generateVideo: (params: {
      prompt: string | { text?: string; images?: Array<string | number[]> }
      modelKey?: string
      options?: { ratio?: string; durationSec?: number }
    }) => Promise<{ ok: true; data: number[]; mediaType: string; url?: string } | { ok: false; error: string }>
    styleAgentChat: (params: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      draft: { name: string; code: string; description: string; prompt: string }
      modelKey?: string
    }) => Promise<{ ok: true; reply: string; draft: { name: string; code: string; description: string; prompt: string } } | { ok: false; error: string }>
    extractCharactersFromScript: (params: {
      script: string
      modelKey?: string
    }) => Promise<{ ok: true; characters: Array<{ name: string; gender: string; age: string; personality: string; appearance: string; background: string }> } | { ok: false; error: string }>
    enhanceCharacterFromScript: (params: {
      script: string
      character: { name: string; gender?: string; age?: string; personality?: string; appearance?: string; background?: string }
      modelKey?: string
    }) => Promise<{ ok: true; character: { name: string; gender: string; age: string; personality: string; appearance: string; background: string } } | { ok: false; error: string }>
    extractScenesFromScript: (params: {
      script: string
      modelKey?: string
    }) => Promise<{ ok: true; scenes: Array<{ title: string; location: string; time: string; mood: string; description: string; shot_notes: string }> } | { ok: false; error: string }>
    extractPropsFromScript: (params: {
      script: string
      modelKey?: string
    }) => Promise<{ ok: true; props: Array<{ name: string; category: string; description: string }> } | { ok: false; error: string }>
    extractCharacterRelationsFromScript: (params: {
      script: string
      characters: Array<{ id: string; name: string; personality?: string; background?: string }>
      existingRelations?: Array<{
        source_ref: string
        target_ref: string
        relation_type: string
        strength?: number
        notes?: string
        evidence?: string
      }>
      modelKey?: string
    }) => Promise<{ ok: true; relations: Array<{ source_ref: string; target_ref: string; relation_type: string; strength: number; notes: string; evidence: string }> } | { ok: false; error: string }>
    enhanceSceneFromScript: (params: {
      script: string
      scene: { title: string; location?: string; time?: string; mood?: string; description?: string; shot_notes?: string }
      modelKey?: string
    }) => Promise<{ ok: true; scene: { title: string; location: string; time: string; mood: string; description: string; shot_notes: string } } | { ok: false; error: string }>
    extractShotsFromScript: (params: {
      script: string
      scenes: Array<{
        id: string
        title: string
        location?: string
        time?: string
        mood?: string
        description?: string
        shot_notes?: string
      }>
      characters: Array<{ id: string; name: string }>
      relations?: Array<{
        source_ref: string
        target_ref: string
        relation_type: string
        strength?: number
        notes?: string
        evidence?: string
      }>
      props: Array<{ id: string; name: string; category?: string; description?: string }>
      costumes: Array<{ id: string; name: string; category?: string; description?: string; character_ids?: string[] }>
      target_count?: number
      modelKey?: string
    }) => Promise<{ ok: true; shots: Array<{ title: string; scene_ref: string; character_refs: string[]; prop_refs: string[]; costume_refs: string[]; shot_size: string; camera_angle: string; camera_move: string; duration_sec: number; action: string; dialogue: string }> } | { ok: false; error: string }>
    scriptToolkit: (params: {
      action:
        | 'scene.expand'
        | 'scene.autocomplete'
        | 'scene.rewrite'
        | 'scene.dialogue-polish'
        | 'scene.pacing'
        | 'scene.continuity-check'
        | 'script.from-idea'
        | 'script.from-novel'
      context: string
      instruction?: string
      modelKey?: string
    }) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
    scriptToolkitStreamStart: (params: {
      action:
        | 'scene.expand'
        | 'scene.autocomplete'
        | 'scene.rewrite'
        | 'scene.dialogue-polish'
        | 'scene.pacing'
        | 'scene.continuity-check'
        | 'script.from-idea'
        | 'script.from-novel'
      context: string
      instruction?: string
      modelKey?: string
    }) => Promise<{ ok: true; requestId: string } | { ok: false; error: string }>
    onScriptToolkitStreamChunk: (
      callback: (payload: { requestId: string; chunk?: string; done: boolean; error?: string }) => void,
    ) => () => void
  }
  settingsAPI: {
    getAll: () => Promise<Array<{ key: string; value: string }>>
    upsert: (key: string, value: string) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  thumbnailsAPI: {
    save: (data: Uint8Array, ext: string, folder?: 'thumbnails' | 'videos') => Promise<string>
    delete: (filepath: string) => Promise<void>
    readBase64: (filepath: string) => Promise<string | null>
  }
  genresAPI: {
    getAll: () => Promise<GenreRow[]>
    insert: (genre: GenreRow) => Promise<void>
    update: (genre: GenreRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  projectsAPI: {
    getAll: () => Promise<ProjectRow[]>
    insert: (project: ProjectRow) => Promise<void>
    update: (project: ProjectRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  seriesAPI: {
    getAll: () => Promise<SeriesRow[]>
    getByProject: (projectId: string) => Promise<SeriesRow[]>
    insert: (series: SeriesRow) => Promise<void>
    update: (series: SeriesRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  charactersAPI: {
    getAll: () => Promise<CharacterRow[]>
    getByProject: (projectId: string) => Promise<CharacterRow[]>
    getBySeries: (seriesId: string) => Promise<CharacterRow[]>
    insert: (character: CharacterRow) => Promise<void>
    update: (character: CharacterRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceByProject: (payload: { projectId: string; characters: CharacterRow[] }) => Promise<void>
    replaceBySeries: (payload: { projectId: string; seriesId: string; characters: CharacterRow[] }) => Promise<void>
    linkToSeries: (payload: { project_id: string; series_id: string; character_id: string; created_at: number }) => Promise<void>
    unlinkFromSeries: (payload: { seriesId: string; characterId: string }) => Promise<void>
  }
  characterRelationsAPI: {
    getAll: () => Promise<CharacterRelationRow[]>
    getByProject: (projectId: string) => Promise<CharacterRelationRow[]>
    insert: (row: CharacterRelationRow) => Promise<void>
    update: (row: CharacterRelationRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceByProject: (payload: { projectId: string; relations: CharacterRelationRow[] }) => Promise<void>
  }
  propsAPI: {
    getAll: () => Promise<PropRow[]>
    getByProject: (projectId: string) => Promise<PropRow[]>
    getBySeries: (seriesId: string) => Promise<PropRow[]>
    insert: (prop: PropRow) => Promise<void>
    update: (prop: PropRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceByProject: (payload: { projectId: string; props: PropRow[] }) => Promise<void>
    replaceBySeries: (payload: { projectId: string; seriesId: string; props: PropRow[] }) => Promise<void>
    linkToSeries: (payload: { project_id: string; series_id: string; prop_id: string; created_at: number }) => Promise<void>
    unlinkFromSeries: (payload: { seriesId: string; propId: string }) => Promise<void>
  }
  costumesAPI: {
    getAll: () => Promise<CostumeRow[]>
    getByProject: (projectId: string) => Promise<CostumeRow[]>
    getBySeries: (seriesId: string) => Promise<CostumeRow[]>
    insert: (costume: CostumeRow) => Promise<void>
    update: (costume: CostumeRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceByProject: (payload: { projectId: string; costumes: CostumeRow[] }) => Promise<void>
    replaceBySeries: (payload: { projectId: string; seriesId: string; costumes: CostumeRow[] }) => Promise<void>
    linkToSeries: (payload: { project_id: string; series_id: string; costume_id: string; created_at: number }) => Promise<void>
    unlinkFromSeries: (payload: { seriesId: string; costumeId: string }) => Promise<void>
  }
  scenesAPI: {
    getAll: () => Promise<SceneRow[]>
    getByProject: (projectId: string) => Promise<SceneRow[]>
    getBySeries: (seriesId: string) => Promise<SceneRow[]>
    insert: (scene: SceneRow) => Promise<void>
    update: (scene: SceneRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceByProject: (payload: { projectId: string; scenes: SceneRow[] }) => Promise<void>
    replaceBySeries: (payload: { projectId: string; seriesId: string; scenes: SceneRow[] }) => Promise<void>
    linkToSeries: (payload: { project_id: string; series_id: string; scene_id: string; created_at: number }) => Promise<void>
    unlinkFromSeries: (payload: { seriesId: string; sceneId: string }) => Promise<void>
  }
  shotsAPI: {
    getAll: () => Promise<ShotRow[]>
    getBySeries: (seriesId: string) => Promise<ShotRow[]>
    insert: (shot: ShotRow) => Promise<void>
    update: (shot: ShotRow) => Promise<void>
    delete: (id: string) => Promise<void>
    replaceBySeries: (payload: { seriesId: string; shots: ShotRow[] }) => Promise<void>
  }
  windowAPI: {
    openStudio: (payload: { projectId: string; seriesId: string }) => Promise<void>
    openExternal: (url: string) => Promise<void>
    getVersion: () => Promise<string>
  }
  mediaAPI: {
    autoEdit: (payload: {
      ratio: '16:9' | '9:16'
      orderedShotIds: string[]
      clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
    }) => Promise<{ outputPath: string }>
    exportMergedVideo: (payload: {
      ratio: '16:9' | '9:16'
      orderedShotIds: string[]
      clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
    }) => Promise<{ outputPath?: string; canceled?: boolean }>
    exportFcpxml: (payload: {
      ratio: '16:9' | '9:16'
      orderedShotIds: string[]
      clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
      projectName?: string
    }) => Promise<{ outputPath?: string; canceled?: boolean }>
    exportEdl: (payload: {
      orderedShotIds: string[]
      clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
      projectName?: string
      fps?: number
    }) => Promise<{ outputPath?: string; canceled?: boolean }>
  }
  categoriesAPI: {
    getAll: () => Promise<CategoryRow[]>
    insert: (category: CategoryRow) => Promise<void>
    update: (category: CategoryRow) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  vectorsAPI: {
    getDimension: () => Promise<number>
    insertDocument: (doc: { id: string; title: string; type: string; project_id?: string }) => Promise<void>
    insertChunk: (chunk: { document_id: string; content: string; chunk_index: number; embedding: number[] }) => Promise<number>
    search: (params: { embedding: number[]; limit?: number; document_id?: string }) => Promise<ChunkSearchResult[]>
    deleteDocument: (document_id: string) => Promise<void>
  }
  dataAPI: {
    getInfo: () => Promise<DataInfo>
    cleanupUnusedMedia: () => Promise<{ removedImages: number; removedVideos: number; freedBytes: number }>
    testObjectStorage: (config: ObjectStorageConfig) => Promise<{ ok: boolean; error?: string; url?: string }>
    selectDirectory: () => Promise<string | null>
    setDirectory: (dir: string) => Promise<void>
    resetDirectory: () => Promise<void>
    openDirectory: () => Promise<void>
    restart: () => Promise<void>
  }
}
