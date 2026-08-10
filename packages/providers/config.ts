import type { CustomProviderDef, ModelDef, ModelType } from './providers'
import { PROVIDER_BASE_URLS } from './constants'

export interface AIProviderConfig {
  apiKey: string
  baseUrl: string
  baseUrlText?: string
  baseUrlImage?: string
  baseUrlVideo?: string
  enabled: boolean
}

export interface AIConfig {
  /** Provider-level settings (API key, base URL, enabled) */
  providers: Record<string, AIProviderConfig>
  /** User-added custom providers */
  customProviders: CustomProviderDef[]
  /** App-wide default model selection per type */
  models: {
    text: string   // "providerId:modelId" or ""
    image: string
    video: string
    embedding: string
  }
  /** User-added custom models per provider */
  customModels: Record<string, ModelDef[]>
  /** Explicitly enabled models, keyed as "providerId:modelId" — models are OFF by default */
  enabledModels: Record<string, boolean>
  /** Hidden built-in models, keyed as "providerId:modelId" */
  hiddenModels: Record<string, boolean>
  /** Concurrency limits for media generation */
  concurrency: {
    image: number
    video: number
  }
}

export const DEFAULT_AI_CONFIG: AIConfig = {
  providers: {},
  customProviders: [],
  models: { text: '', image: '', video: '', embedding: '' },
  customModels: {},
  enabledModels: {},
  hiddenModels: {},
  concurrency: { image: 5, video: 5 },
}

function normalizeCustomProviders(raw: unknown): CustomProviderDef[] {
  if (!Array.isArray(raw)) return []

  const result: CustomProviderDef[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<CustomProviderDef>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)

    const nameRaw = typeof row.name === 'string' ? row.name.trim() : ''
    const defaultBaseUrl = typeof row.defaultBaseUrl === 'string'
      ? row.defaultBaseUrl.trim()
      : ''

    result.push({
      id,
      name: nameRaw || id,
      ...(row.noApiKey === true ? { noApiKey: true } : {}),
      ...(defaultBaseUrl ? { defaultBaseUrl } : {}),
    })
  }

  return result
}

function normalizeConcurrency(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(1, Math.min(20, Math.trunc(num)))
}

function normalizeProviderConfig(value: unknown): AIProviderConfig | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<AIProviderConfig>
  const baseUrl = typeof row.baseUrl === 'string' ? row.baseUrl : ''
  const baseUrlText = typeof row.baseUrlText === 'string' ? row.baseUrlText : baseUrl
  const baseUrlImage = typeof row.baseUrlImage === 'string' ? row.baseUrlImage : ''
  const baseUrlVideo = typeof row.baseUrlVideo === 'string' ? row.baseUrlVideo : ''
  return {
    apiKey: typeof row.apiKey === 'string' ? row.apiKey : '',
    baseUrl,
    baseUrlText,
    baseUrlImage,
    baseUrlVideo,
    enabled: row.enabled === true,
  }
}

function normalizeProviders(raw: unknown): Record<string, AIProviderConfig> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, AIProviderConfig> = {}
  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeProviderConfig(value)
    if (!normalized) continue
    out[providerId] = normalized
  }
  return out
}

function normalizeModels(raw: unknown): AIConfig['models'] {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_CONFIG.models }
  const row = raw as Partial<AIConfig['models']>
  return {
    text: typeof row.text === 'string' ? row.text : '',
    image: typeof row.image === 'string' ? row.image : '',
    video: typeof row.video === 'string' ? row.video : '',
    embedding: typeof row.embedding === 'string' ? row.embedding : '',
  }
}

function normalizeCustomModels(raw: unknown): Record<string, ModelDef[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ModelDef[]> = {}
  const allowedTypes = new Set<ModelType>(['text', 'image', 'video', 'embedding'])

  for (const [providerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const models = value.flatMap((item): ModelDef[] => {
      if (!item || typeof item !== 'object') return []
      const row = item as Partial<ModelDef>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      const type = row.type
      if (!id || !name || !type || !allowedTypes.has(type)) return []
      const dimension = Number(row.dimension)
      return [{
        id,
        name,
        type,
        ...(type === 'embedding' && Number.isInteger(dimension) && dimension > 0
          ? { dimension }
          : {}),
      }]
    })
    if (models.length > 0) out[providerId] = models
  }

  return out
}

function normalizeBooleanRecord(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
  )
}

export function normalizeAIConfig(raw: unknown): AIConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_AI_CONFIG
  const parsed = raw as Partial<AIConfig>
  return {
    providers: normalizeProviders(parsed.providers),
    customProviders: normalizeCustomProviders(parsed.customProviders),
    models: normalizeModels(parsed.models),
    customModels: normalizeCustomModels(parsed.customModels),
    enabledModels: normalizeBooleanRecord(parsed.enabledModels),
    hiddenModels: normalizeBooleanRecord(parsed.hiddenModels),
    concurrency: {
      image: normalizeConcurrency(parsed.concurrency?.image, DEFAULT_AI_CONFIG.concurrency.image),
      video: normalizeConcurrency(parsed.concurrency?.video, DEFAULT_AI_CONFIG.concurrency.video),
    },
  }
}

export function getProviderBaseUrl(
  config: AIProviderConfig,
  type: 'text' | 'image' | 'video' | 'embedding',
  providerId?: string,
): string {
  if (type === 'image') {
    const configured = (config.baseUrlImage ?? '').trim()
    if (configured) return configured
    if (providerId === 'qwen') return PROVIDER_BASE_URLS.qwenMedia
    return config.baseUrl.trim()
  }
  if (type === 'video') {
    const configured = (config.baseUrlVideo ?? '').trim()
    if (configured) return configured
    if (providerId === 'qwen') return PROVIDER_BASE_URLS.qwenMedia
    return config.baseUrl.trim()
  }
  return (config.baseUrlText ?? '').trim() || config.baseUrl.trim()
}

export function parseAIConfig(raw: string | undefined): AIConfig {
  if (!raw) return DEFAULT_AI_CONFIG
  try {
    return normalizeAIConfig(JSON.parse(raw))
  } catch {
    return DEFAULT_AI_CONFIG
  }
}

export type { ModelDef, ModelType }
