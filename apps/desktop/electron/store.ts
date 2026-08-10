import Store from 'electron-store'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_AI_CONFIG, type AIConfig } from '@openframe/providers'
import { resolveLegacySettingsFiles, resolveSettingsDirectory } from './settings_path'

const modelKeySchema = { type: 'string', default: '' } as const

const providerConfigSchema = {
  type: 'object',
  properties: {
    apiKey:  { type: 'string', default: '' },
    baseUrl: { type: 'string', default: '' },
    baseUrlText: { type: 'string', default: '' },
    baseUrlImage: { type: 'string', default: '' },
    baseUrlVideo: { type: 'string', default: '' },
    enabled: { type: 'boolean', default: false },
  },
  default: { apiKey: '', baseUrl: '', baseUrlText: '', baseUrlImage: '', baseUrlVideo: '', enabled: false },
} as const

const customProviderSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    noApiKey: { type: 'boolean', default: false },
    defaultBaseUrl: { type: 'string', default: '' },
  },
  required: ['id', 'name'],
} as const

const modelDefSchema = {
  type: 'object',
  properties: {
    id:   { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['text', 'image', 'video', 'embedding'] },
  },
  required: ['id', 'name', 'type'],
} as const

export interface AppSettings {
  language: string
  theme: string
  onboarding_seen: string
  onboarding_version: string
  update_dismissed_version: string
  prompt_overrides: string
  storage_config: string
  ai_config: AIConfig
  vec_dimension: number
  data_dir: string
  pending_data_dir: string
}

const appDataDirectory = app.getPath('appData')
const settingsDirectory = resolveSettingsDirectory(appDataDirectory)
const settingsFile = path.join(settingsDirectory, 'settings.json')

if (!fs.existsSync(settingsFile)) {
  const legacySettingsFile = resolveLegacySettingsFiles(appDataDirectory)
    .find((candidate) => fs.existsSync(candidate))
  if (legacySettingsFile) {
    fs.mkdirSync(settingsDirectory, { recursive: true })
    fs.copyFileSync(legacySettingsFile, settingsFile)
  }
}

export const store = new Store<AppSettings>({
  name: 'settings',
  cwd: settingsDirectory,
  schema: {
    language: {
      type: 'string',
      enum: ['en', 'zh'],
      default: 'en',
    },
    theme: {
      type: 'string',
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    onboarding_seen: {
      type: 'string',
      default: '',
    },
    onboarding_version: {
      type: 'string',
      default: '',
    },
    update_dismissed_version: {
      type: 'string',
      default: '',
    },
    prompt_overrides: {
      type: 'string',
      default: '',
    },
    storage_config: {
      type: 'string',
      default: '',
    },
    ai_config: {
      type: 'object',
      properties: {
        providers: {
          type: 'object',
          additionalProperties: providerConfigSchema,
          default: {},
        },
        customProviders: {
          type: 'array',
          items: customProviderSchema,
          default: [],
        },
        models: {
          type: 'object',
          properties: {
            text:      modelKeySchema,
            image:     modelKeySchema,
            video:     modelKeySchema,
            embedding: modelKeySchema,
          },
          default: { text: '', image: '', video: '', embedding: '' },
        },
        customModels: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: modelDefSchema,
            default: [],
          },
          default: {},
        },
        enabledModels: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
          default: {},
        },
        hiddenModels: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
          default: {},
        },
      },
      default: DEFAULT_AI_CONFIG,
    },
    vec_dimension: {
      type: 'number',
      default: 0,
    },
    data_dir: {
      type: 'string',
      default: '',
    },
    pending_data_dir: {
      type: 'string',
      default: '',
    },
  },
  defaults: {
    language: 'en',
    theme: 'system',
    onboarding_seen: '',
    onboarding_version: '',
    update_dismissed_version: '',
    prompt_overrides: '',
    storage_config: '',
    ai_config: DEFAULT_AI_CONFIG,
    vec_dimension: 0,
    data_dir: '',
    pending_data_dir: '',
  },
})
