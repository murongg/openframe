import { ipcMain } from 'electron'
import { embed, embedMany, generateText } from 'ai'
import { CONNECTION_TEST_PROMPT } from '@openframe/prompts'
import {
  createProviderModel,
  isLanguageModel,
  getDefaultEmbeddingModel,
  generateImageWithProviderSupport,
  generateVideoWithProviderSupport,
} from '@openframe/providers/factory'
import { normalizeAIConfig, type AIConfig } from '@openframe/providers'
import { store } from '../../store'
import { resolveImageModel, resolveVideoModel } from './model'
import { shortError } from './shared'

export function registerAIBaseAndMediaHandlers() {
  ipcMain.handle('ai:getConfig', (): AIConfig => normalizeAIConfig(store.get('ai_config')))

  ipcMain.handle('ai:saveConfig', (_event, config: AIConfig) => {
    store.set('ai_config', normalizeAIConfig(config))
  })

  ipcMain.handle(
    'ai:testConnection',
    async (
      _event,
      params: { providerId: string; modelId: string; apiKey: string; baseUrl?: string },
    ) => {
      const { providerId, modelId, apiKey, baseUrl } = params

      const config: AIConfig = {
        providers: {
          [providerId]: { apiKey, baseUrl: baseUrl ?? '', enabled: true },
        },
        customProviders: [],
        models: { text: '', image: '', video: '', embedding: '' },
        customModels: {},
        enabledModels: {},
        hiddenModels: {},
        concurrency: { image: 5, video: 5 },
      }

      try {
        const model = createProviderModel(providerId, modelId, config)
        if (!model) return { ok: false, error: 'Provider not supported' }
        if (!isLanguageModel(model)) return { ok: false, error: 'Model type cannot be tested' }

        await generateText({ model, prompt: CONNECTION_TEST_PROMPT, maxOutputTokens: 1 })
        return { ok: true }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )

  ipcMain.handle('ai:embed', async (_event, text: string): Promise<number[] | null> => {
    const embeddingModel = getDefaultEmbeddingModel(store.get('ai_config'))
    if (!embeddingModel) return null
    const { embedding } = await embed({ model: embeddingModel, value: text })
    return Array.from(embedding)
  })

  ipcMain.handle('ai:embedBatch', async (_event, texts: string[]): Promise<number[][] | null> => {
    const embeddingModel = getDefaultEmbeddingModel(store.get('ai_config'))
    if (!embeddingModel) return null
    const { embeddings } = await embedMany({ model: embeddingModel, values: texts })
    return embeddings.map((e) => Array.from(e))
  })

  ipcMain.handle(
    'ai:generateImage',
    async (
      _event,
      params: {
        prompt: string | { text?: string; images: Array<string | number[]> }
        modelKey?: string
        options?: { size?: string; ratio?: string }
      },
    ): Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const resolved = resolveImageModel(config, params.modelKey)
      if ('error' in resolved) return { ok: false, error: resolved.error }

      try {
        const generated = await generateImageWithProviderSupport({
          model: resolved.model,
          prompt: params.prompt,
          options: params.options,
        })
        return {
          ok: true,
          data: generated.data,
          mediaType: generated.mediaType,
        }
      } catch (err: unknown) {
        const msg = shortError(err)
        if (/Unsupported role:\s*undefined/i.test(msg)) {
          return {
            ok: false,
            error: 'Selected model does not support image generation in current provider SDK. Please choose another image model.',
          }
        }
        return { ok: false, error: msg }
      }
    },
  )

  ipcMain.handle(
    'ai:generateVideo',
    async (
      _event,
      params: {
        prompt: string | { text?: string; images?: Array<string | number[]> }
        modelKey?: string
        options?: { ratio?: string; durationSec?: number }
      },
    ): Promise<{ ok: true; data: number[]; mediaType: string } | { ok: false; error: string }> => {
      const config = store.get('ai_config') as AIConfig
      const resolved = resolveVideoModel(config, params.modelKey)
      if ('error' in resolved) return { ok: false, error: resolved.error }

      try {
        const generated = await generateVideoWithProviderSupport({
          model: resolved.model,
          prompt: params.prompt,
          options: params.options,
        })
        return {
          ok: true,
          data: generated.data,
          mediaType: generated.mediaType,
        }
      } catch (err: unknown) {
        return { ok: false, error: shortError(err) }
      }
    },
  )
}
