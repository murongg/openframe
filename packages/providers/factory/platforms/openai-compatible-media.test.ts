import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateOpenAICompatibleImage,
  generateOpenAICompatibleVideo,
} from './openai-compatible-media'
import { encodeBase64 } from '@openframe/shared'

const mocks = vi.hoisted(() => {
  return {
    sleep: vi.fn(async () => {}),
  }
})

vi.mock('@openframe/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openframe/shared')>()
  return {
    ...actual,
    sleep: mocks.sleep,
  }
})

describe('openai-compatible media adapter', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    mocks.sleep.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('falls back image endpoint path and decodes base64 payload', async () => {
    const imageBase64 = encodeBase64([1, 2, 3])

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/v1/images/generations')) {
        const body = JSON.parse(String(init?.body))
        expect(body).toMatchObject({
          model: 'image-model',
          prompt: 'a cat',
          n: 1,
          size: '1024x1024',
          aspect_ratio: '16:9',
        })
        return new Response(
          JSON.stringify({ data: [{ b64_json: imageBase64 }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/images/generations')) {
        return new Response('not found', { status: 404 })
      }
      return new Response('unexpected', { status: 500 })
    })

    globalThis.fetch = fetchMock as typeof fetch

    const result = await generateOpenAICompatibleImage({
      apiKey: 'k',
      baseURL: 'https://api.example.com',
      modelId: 'image-model',
      prompt: 'a cat',
      size: '1024x1024',
      ratio: '16:9',
    })

    expect(result).toEqual({
      data: [1, 2, 3],
      mediaType: 'image/png',
    })
  })

  it('decodes data-url image payload without secondary download request', async () => {
    const dataUrl = `data:image/jpeg;base64,${encodeBase64([9, 8, 7])}`
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/images/generations')) {
        return new Response(
          JSON.stringify({ data: [{ url: dataUrl }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('unexpected', { status: 500 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await generateOpenAICompatibleImage({
      baseURL: 'https://api.example.com',
      modelId: 'image-model',
      prompt: 'portrait',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      data: [9, 8, 7],
      mediaType: 'image/jpeg',
    })
  })

  it('throws extracted error message when image payload is missing', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'quota exceeded' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    globalThis.fetch = fetchMock as typeof fetch

    await expect(
      generateOpenAICompatibleImage({
        baseURL: 'https://api.example.com',
        modelId: 'image-model',
        prompt: 'portrait',
      }),
    ).rejects.toThrow('quota exceeded')
  })

  it('handles async video task polling and downloads final video', async () => {
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url.endsWith('/videos/generations')) {
        return new Response(
          JSON.stringify({ task_id: 'task-1' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.endsWith('/videos/generations/task-1')) {
        statusCalls += 1
        if (statusCalls === 1) {
          return new Response(
            JSON.stringify({ status: 'running' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({ status: 'succeeded', video_url: 'https://cdn.example.com/out.webm' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url === 'https://cdn.example.com/out.webm') {
        return new Response(new Uint8Array([4, 5, 6]), { status: 200 })
      }

      return new Response('not found', { status: 404 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await generateOpenAICompatibleVideo({
      apiKey: 'k',
      baseURL: 'https://api.example.com',
      modelId: 'video-model',
      prompt: 'sunset',
      ratio: '9:16',
      durationSec: 4,
    })

    expect(mocks.sleep).toHaveBeenCalled()
    expect(result).toEqual({
      data: [4, 5, 6],
      mediaType: 'video/webm',
      url: 'https://cdn.example.com/out.webm',
    })
  })

  it('returns immediate base64 video payload without polling', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/videos/generations')) {
        return new Response(
          JSON.stringify({ b64_json: encodeBase64([2, 4, 6]) }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('unexpected', { status: 500 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await generateOpenAICompatibleVideo({
      baseURL: 'https://api.example.com',
      modelId: 'video-model',
      prompt: 'quick clip',
    })

    expect(mocks.sleep).not.toHaveBeenCalled()
    expect(result).toEqual({
      data: [2, 4, 6],
      mediaType: 'video/mp4',
    })
  })

  it('throws polling error on failed video task status', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/videos/generations')) {
        return new Response(
          JSON.stringify({ task_id: 'task-2' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/videos/generations/task-2')) {
        return new Response(
          JSON.stringify({ status: 'failed', error: { message: 'policy rejected' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })
    globalThis.fetch = fetchMock as typeof fetch

    await expect(
      generateOpenAICompatibleVideo({
        baseURL: 'https://api.example.com',
        modelId: 'video-model',
        prompt: 'failed job',
      }),
    ).rejects.toThrow('policy rejected')
  })

  it('throws clear error when base url is missing', async () => {
    await expect(
      generateOpenAICompatibleVideo({
        modelId: 'video-model',
        prompt: 'test',
      }),
    ).rejects.toThrow('Provider base URL is missing.')
  })
})
