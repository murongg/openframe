import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose Settings API to the Renderer process ---------
contextBridge.exposeInMainWorld('settingsAPI', {
  getAll: (): Promise<Array<{ key: string; value: string }>> =>
    ipcRenderer.invoke('settings:getAll'),
  upsert: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('settings:upsert', key, value),
  delete: (key: string): Promise<void> =>
    ipcRenderer.invoke('settings:delete', key),
})

// --------- Expose Genres API to the Renderer process ---------
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

// --------- Expose Thumbnails API to the Renderer process ---------
contextBridge.exposeInMainWorld('thumbnailsAPI', {
  save: (data: Uint8Array, ext: string, folder?: 'thumbnails' | 'videos'): Promise<string> =>
    ipcRenderer.invoke('thumbnails:save', data, ext, folder),
  delete: (filepath: string): Promise<void> =>
    ipcRenderer.invoke('thumbnails:delete', filepath),
  readBase64: (filepath: string): Promise<string | null> =>
    ipcRenderer.invoke('thumbnails:readBase64', filepath),
})

contextBridge.exposeInMainWorld('aiAPI', {
  getConfig: (): Promise<unknown> =>
    ipcRenderer.invoke('ai:getConfig'),
  saveConfig: (config: unknown): Promise<void> =>
    ipcRenderer.invoke('ai:saveConfig', config),
  testConnection: (params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('ai:testConnection', params),
  embed: (text: string): Promise<number[] | null> =>
    ipcRenderer.invoke('ai:embed', text),
  embedBatch: (texts: string[]): Promise<number[][] | null> =>
    ipcRenderer.invoke('ai:embedBatch', texts),
  generateImage: (
    params: {
      prompt: string | { text?: string; images: Array<string | number[]> }
      modelKey?: string
      options?: { size?: string; ratio?: string }
    },
  ): Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:generateImage', params),
  generateVideo: (
    params: {
      prompt: string | { text?: string; images?: Array<string | number[]> }
      modelKey?: string
      options?: { ratio?: string; durationSec?: number }
    },
  ): Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:generateVideo', params),
  styleAgentChat: (
    params: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      draft: { name: string; code: string; description: string; prompt: string }
      modelKey?: string
    },
  ): Promise<{ ok: true; reply: string; draft: { name: string; code: string; description: string; prompt: string } } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:styleAgentChat', params),
  extractCharactersFromScript: (
    params: { script: string; modelKey?: string },
  ): Promise<{ ok: true; characters: Array<{ name: string; gender: string; age: string; personality: string; appearance: string; background: string }> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:extractCharactersFromScript', params),
  enhanceCharacterFromScript: (
    params: {
      script: string
      character: { name: string; gender?: string; age?: string; personality?: string; appearance?: string; background?: string }
      modelKey?: string
    },
  ): Promise<{ ok: true; character: { name: string; gender: string; age: string; personality: string; appearance: string; background: string } } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:enhanceCharacterFromScript', params),
  extractScenesFromScript: (
    params: { script: string; modelKey?: string },
  ): Promise<{ ok: true; scenes: Array<{ title: string; location: string; time: string; mood: string; description: string; shot_notes: string }> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:extractScenesFromScript', params),
  extractPropsFromScript: (
    params: { script: string; modelKey?: string },
  ): Promise<{ ok: true; props: Array<{ name: string; category: string; description: string }> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:extractPropsFromScript', params),
  extractCharacterRelationsFromScript: (
    params: {
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
    },
  ): Promise<{ ok: true; relations: Array<{ source_ref: string; target_ref: string; relation_type: string; strength: number; notes: string; evidence: string }> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:extractCharacterRelationsFromScript', params),
  enhanceSceneFromScript: (
    params: {
      script: string
      scene: { title: string; location?: string; time?: string; mood?: string; description?: string; shot_notes?: string }
      modelKey?: string
    },
  ): Promise<{ ok: true; scene: { title: string; location: string; time: string; mood: string; description: string; shot_notes: string } } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:enhanceSceneFromScript', params),
  extractShotsFromScript: (
    params: {
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
    },
  ): Promise<{ ok: true; shots: Array<{ title: string; scene_ref: string; character_refs: string[]; prop_refs: string[]; costume_refs: string[]; shot_size: string; camera_angle: string; camera_move: string; duration_sec: number; action: string; dialogue: string }> } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:extractShotsFromScript', params),
  scriptToolkit: (
    params: {
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
    },
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:scriptToolkit', params),
  scriptToolkitStreamStart: (
    params: {
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
    },
  ): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('ai:scriptToolkitStreamStart', params),
  onScriptToolkitStreamChunk: (
    callback: (payload: { requestId: string; chunk?: string; done: boolean; error?: string }) => void,
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: string; chunk?: string; done: boolean; error?: string }) => {
      callback(payload)
    }
    ipcRenderer.on('ai:scriptToolkitStreamChunk', listener)
    return () => {
      ipcRenderer.removeListener('ai:scriptToolkitStreamChunk', listener)
    }
  },
})

contextBridge.exposeInMainWorld('vectorsAPI', {
  getDimension: (): Promise<number> =>
    ipcRenderer.invoke('vectors:getDimension'),
  insertDocument: (doc: { id: string; title: string; type: string; project_id?: string }): Promise<void> =>
    ipcRenderer.invoke('vectors:insertDocument', doc),
  insertChunk: (chunk: { document_id: string; content: string; chunk_index: number; embedding: number[] }): Promise<number> =>
    ipcRenderer.invoke('vectors:insertChunk', chunk),
  search: (params: { embedding: number[]; limit?: number; document_id?: string }): Promise<{ chunk_id: number; document_id: string; content: string; chunk_index: number; distance: number }[]> =>
    ipcRenderer.invoke('vectors:search', params),
  deleteDocument: (document_id: string): Promise<void> =>
    ipcRenderer.invoke('vectors:deleteDocument', document_id),
})

contextBridge.exposeInMainWorld('dataAPI', {
  getInfo: (): Promise<{ defaultDir: string; currentDir: string; pendingDir: string; dbSize: number; thumbsSize: number; videosSize: number }> =>
    ipcRenderer.invoke('data:getInfo'),
  cleanupUnusedMedia: (): Promise<{ removedImages: number; removedVideos: number; freedBytes: number }> =>
    ipcRenderer.invoke('data:cleanupUnusedMedia'),
  testObjectStorage: (config: ObjectStorageConfig): Promise<{ ok: boolean; error?: string; url?: string }> =>
    ipcRenderer.invoke('data:testObjectStorage', config),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('data:selectDirectory'),
  setDirectory: (dir: string): Promise<void> =>
    ipcRenderer.invoke('data:setDirectory', dir),
  resetDirectory: (): Promise<void> =>
    ipcRenderer.invoke('data:resetDirectory'),
  openDirectory: (): Promise<void> =>
    ipcRenderer.invoke('data:openDirectory'),
  restart: (): Promise<void> =>
    ipcRenderer.invoke('data:restart'),
})

contextBridge.exposeInMainWorld('genresAPI', {
  getAll: (): Promise<GenreRow[]> => ipcRenderer.invoke('genres:getAll'),
  insert: (genre: GenreRow): Promise<void> => ipcRenderer.invoke('genres:insert', genre),
  update: (genre: GenreRow): Promise<void> => ipcRenderer.invoke('genres:update', genre),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('genres:delete', id),
})

contextBridge.exposeInMainWorld('projectsAPI', {
  getAll: (): Promise<ProjectRow[]> => ipcRenderer.invoke('projects:getAll'),
  insert: (project: ProjectRow): Promise<void> => ipcRenderer.invoke('projects:insert', project),
  update: (project: ProjectRow): Promise<void> => ipcRenderer.invoke('projects:update', project),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('projects:delete', id),
})

contextBridge.exposeInMainWorld('seriesAPI', {
  getAll: (): Promise<SeriesRow[]> => ipcRenderer.invoke('series:getAll'),
  getByProject: (projectId: string): Promise<SeriesRow[]> => ipcRenderer.invoke('series:getByProject', projectId),
  insert: (series: SeriesRow): Promise<void> => ipcRenderer.invoke('series:insert', series),
  update: (series: SeriesRow): Promise<void> => ipcRenderer.invoke('series:update', series),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('series:delete', id),
})

contextBridge.exposeInMainWorld('charactersAPI', {
  getAll: (): Promise<CharacterRow[]> => ipcRenderer.invoke('characters:getAll'),
  getByProject: (projectId: string): Promise<CharacterRow[]> => ipcRenderer.invoke('characters:getByProject', projectId),
  getBySeries: (seriesId: string): Promise<CharacterRow[]> => ipcRenderer.invoke('characters:getBySeries', seriesId),
  insert: (character: CharacterRow): Promise<void> => ipcRenderer.invoke('characters:insert', character),
  update: (character: CharacterRow): Promise<void> => ipcRenderer.invoke('characters:update', character),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('characters:delete', id),
  replaceByProject: (payload: { projectId: string; characters: CharacterRow[] }): Promise<void> =>
    ipcRenderer.invoke('characters:replaceByProject', payload),
  replaceBySeries: (payload: { projectId: string; seriesId: string; characters: CharacterRow[] }): Promise<void> =>
    ipcRenderer.invoke('characters:replaceBySeries', payload),
  linkToSeries: (payload: { project_id: string; series_id: string; character_id: string; created_at: number }): Promise<void> =>
    ipcRenderer.invoke('characters:linkToSeries', payload),
  unlinkFromSeries: (payload: { seriesId: string; characterId: string }): Promise<void> =>
    ipcRenderer.invoke('characters:unlinkFromSeries', payload),
})

contextBridge.exposeInMainWorld('characterRelationsAPI', {
  getAll: (): Promise<CharacterRelationRow[]> => ipcRenderer.invoke('characterRelations:getAll'),
  getByProject: (projectId: string): Promise<CharacterRelationRow[]> => ipcRenderer.invoke('characterRelations:getByProject', projectId),
  insert: (row: CharacterRelationRow): Promise<void> => ipcRenderer.invoke('characterRelations:insert', row),
  update: (row: CharacterRelationRow): Promise<void> => ipcRenderer.invoke('characterRelations:update', row),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('characterRelations:delete', id),
  replaceByProject: (payload: { projectId: string; relations: CharacterRelationRow[] }): Promise<void> =>
    ipcRenderer.invoke('characterRelations:replaceByProject', payload),
})

contextBridge.exposeInMainWorld('propsAPI', {
  getAll: (): Promise<PropRow[]> => ipcRenderer.invoke('props:getAll'),
  getByProject: (projectId: string): Promise<PropRow[]> => ipcRenderer.invoke('props:getByProject', projectId),
  getBySeries: (seriesId: string): Promise<PropRow[]> => ipcRenderer.invoke('props:getBySeries', seriesId),
  insert: (prop: PropRow): Promise<void> => ipcRenderer.invoke('props:insert', prop),
  update: (prop: PropRow): Promise<void> => ipcRenderer.invoke('props:update', prop),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('props:delete', id),
  replaceByProject: (payload: { projectId: string; props: PropRow[] }): Promise<void> =>
    ipcRenderer.invoke('props:replaceByProject', payload),
  replaceBySeries: (payload: { projectId: string; seriesId: string; props: PropRow[] }): Promise<void> =>
    ipcRenderer.invoke('props:replaceBySeries', payload),
  linkToSeries: (payload: { project_id: string; series_id: string; prop_id: string; created_at: number }): Promise<void> =>
    ipcRenderer.invoke('props:linkToSeries', payload),
  unlinkFromSeries: (payload: { seriesId: string; propId: string }): Promise<void> =>
    ipcRenderer.invoke('props:unlinkFromSeries', payload),
})

contextBridge.exposeInMainWorld('costumesAPI', {
  getAll: (): Promise<CostumeRow[]> => ipcRenderer.invoke('costumes:getAll'),
  getByProject: (projectId: string): Promise<CostumeRow[]> => ipcRenderer.invoke('costumes:getByProject', projectId),
  getBySeries: (seriesId: string): Promise<CostumeRow[]> => ipcRenderer.invoke('costumes:getBySeries', seriesId),
  insert: (costume: CostumeRow): Promise<void> => ipcRenderer.invoke('costumes:insert', costume),
  update: (costume: CostumeRow): Promise<void> => ipcRenderer.invoke('costumes:update', costume),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('costumes:delete', id),
  replaceByProject: (payload: { projectId: string; costumes: CostumeRow[] }): Promise<void> =>
    ipcRenderer.invoke('costumes:replaceByProject', payload),
  replaceBySeries: (payload: { projectId: string; seriesId: string; costumes: CostumeRow[] }): Promise<void> =>
    ipcRenderer.invoke('costumes:replaceBySeries', payload),
  linkToSeries: (payload: { project_id: string; series_id: string; costume_id: string; created_at: number }): Promise<void> =>
    ipcRenderer.invoke('costumes:linkToSeries', payload),
  unlinkFromSeries: (payload: { seriesId: string; costumeId: string }): Promise<void> =>
    ipcRenderer.invoke('costumes:unlinkFromSeries', payload),
})

contextBridge.exposeInMainWorld('scenesAPI', {
  getAll: (): Promise<SceneRow[]> => ipcRenderer.invoke('scenes:getAll'),
  getByProject: (projectId: string): Promise<SceneRow[]> => ipcRenderer.invoke('scenes:getByProject', projectId),
  getBySeries: (seriesId: string): Promise<SceneRow[]> => ipcRenderer.invoke('scenes:getBySeries', seriesId),
  insert: (scene: SceneRow): Promise<void> => ipcRenderer.invoke('scenes:insert', scene),
  update: (scene: SceneRow): Promise<void> => ipcRenderer.invoke('scenes:update', scene),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('scenes:delete', id),
  replaceByProject: (payload: { projectId: string; scenes: SceneRow[] }): Promise<void> =>
    ipcRenderer.invoke('scenes:replaceByProject', payload),
  replaceBySeries: (payload: { projectId: string; seriesId: string; scenes: SceneRow[] }): Promise<void> =>
    ipcRenderer.invoke('scenes:replaceBySeries', payload),
  linkToSeries: (payload: { project_id: string; series_id: string; scene_id: string; created_at: number }): Promise<void> =>
    ipcRenderer.invoke('scenes:linkToSeries', payload),
  unlinkFromSeries: (payload: { seriesId: string; sceneId: string }): Promise<void> =>
    ipcRenderer.invoke('scenes:unlinkFromSeries', payload),
})

contextBridge.exposeInMainWorld('shotsAPI', {
  getAll: (): Promise<ShotRow[]> => ipcRenderer.invoke('shots:getAll'),
  getBySeries: (seriesId: string): Promise<ShotRow[]> => ipcRenderer.invoke('shots:getBySeries', seriesId),
  insert: (shot: ShotRow): Promise<void> => ipcRenderer.invoke('shots:insert', shot),
  update: (shot: ShotRow): Promise<void> => ipcRenderer.invoke('shots:update', shot),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('shots:delete', id),
  replaceBySeries: (payload: { seriesId: string; shots: ShotRow[] }): Promise<void> =>
    ipcRenderer.invoke('shots:replaceBySeries', payload),
})

contextBridge.exposeInMainWorld('windowAPI', {
  openStudio: (payload: { projectId: string; seriesId: string }): Promise<void> =>
    ipcRenderer.invoke('window:openStudio', payload),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('window:openExternal', url),
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke('window:getVersion'),
})

contextBridge.exposeInMainWorld('mediaAPI', {
  autoEdit: (payload: {
    ratio: '16:9' | '9:16'
    orderedShotIds: string[]
    clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
  }): Promise<{ outputPath: string }> =>
    ipcRenderer.invoke('media:autoEdit', payload),
  exportMergedVideo: (payload: {
    ratio: '16:9' | '9:16'
    orderedShotIds: string[]
    clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
  }): Promise<{ outputPath?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('media:exportMergedVideo', payload),
  exportFcpxml: (payload: {
    ratio: '16:9' | '9:16'
    orderedShotIds: string[]
    clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
    projectName?: string
  }): Promise<{ outputPath?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('media:exportFcpxml', payload),
  exportEdl: (payload: {
    orderedShotIds: string[]
    clips: Array<{ shotId: string; path: string; title?: string; trimStartSec?: number; trimEndSec?: number }>
    projectName?: string
    fps?: number
  }): Promise<{ outputPath?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('media:exportEdl', payload),
})

contextBridge.exposeInMainWorld('categoriesAPI', {
  getAll: (): Promise<CategoryRow[]> => ipcRenderer.invoke('categories:getAll'),
  insert: (category: CategoryRow): Promise<void> => ipcRenderer.invoke('categories:insert', category),
  update: (category: CategoryRow): Promise<void> => ipcRenderer.invoke('categories:update', category),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('categories:delete', id),
})
