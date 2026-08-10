import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_CONFIG, normalizeAIConfig, parseAIConfig } from './config'

describe('parseAIConfig', () => {
  it('normalizes an object received over IPC without stringifying it first', () => {
    const parsed = normalizeAIConfig({
      customProviders: [{ id: ' custom ', name: ' Custom ' }],
      customModels: {
        custom: [{ id: 'model', name: 'Model', type: 'text' }],
      },
    })

    expect(parsed.customProviders).toEqual([{ id: 'custom', name: 'Custom' }])
    expect(parsed.customModels.custom).toEqual([{ id: 'model', name: 'Model', type: 'text' }])
    expect(parsed.concurrency).toEqual(DEFAULT_AI_CONFIG.concurrency)
  })

  it('returns default config when input is empty or invalid json', () => {
    expect(parseAIConfig(undefined)).toBe(DEFAULT_AI_CONFIG)
    expect(parseAIConfig('{bad json')).toBe(DEFAULT_AI_CONFIG)
  })

  it('normalizes custom providers and merges model defaults', () => {
    const raw = JSON.stringify({
      providers: {
        openai: { apiKey: 'k', baseUrl: 'https://api.example.com', enabled: true },
      },
      customProviders: [
        { id: '  custom-a ', name: '  Custom A  ', defaultBaseUrl: ' https://custom-a.test ', noApiKey: true },
        { id: 'custom-a', name: 'Duplicated' },
        { id: '', name: 'Invalid' },
        { id: 'custom-b', name: '   ' },
      ],
      models: {
        text: 'openai:gpt-4o',
      },
      customModels: {
        openai: [{ id: 'my-model', name: 'My Model', type: 'text' }],
      },
      enabledModels: {
        'openai:gpt-4o': true,
      },
      hiddenModels: {
        'openai:o1': true,
      },
      concurrency: {
        image: 0,
        video: 99,
      },
    })

    const parsed = parseAIConfig(raw)

    expect(parsed.customProviders).toEqual([
      { id: 'custom-a', name: 'Custom A', defaultBaseUrl: 'https://custom-a.test', noApiKey: true },
      { id: 'custom-b', name: 'custom-b' },
    ])

    expect(parsed.models).toEqual({
      text: 'openai:gpt-4o',
      image: '',
      video: '',
      embedding: '',
    })
    expect(parsed.providers.openai?.enabled).toBe(true)
    expect(parsed.customModels.openai).toEqual([{ id: 'my-model', name: 'My Model', type: 'text' }])
    expect(parsed.enabledModels['openai:gpt-4o']).toBe(true)
    expect(parsed.hiddenModels['openai:o1']).toBe(true)
    expect(parsed.concurrency).toEqual({ image: 1, video: 20 })
  })

  it('falls back concurrency to defaults when values are invalid', () => {
    const raw = JSON.stringify({
      concurrency: {
        image: 'not-a-number',
        video: null,
      },
    })

    const parsed = parseAIConfig(raw)

    expect(parsed.concurrency).toEqual({
      image: DEFAULT_AI_CONFIG.concurrency.image,
      video: 1,
    })
  })

  it('truncates and clamps concurrency from numeric-like values', () => {
    const parsed = parseAIConfig(
      JSON.stringify({
        customProviders: {},
        concurrency: {
          image: '12.9',
          video: -3,
        },
      }),
    )

    expect(parsed.customProviders).toEqual([])
    expect(parsed.concurrency).toEqual({
      image: 12,
      video: 1,
    })
  })
})
