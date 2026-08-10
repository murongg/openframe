import { createObjectStorageFactory } from '@openframe/shared/object-storage-factory'
import type { ObjectStorageConfig } from '@openframe/shared/object-storage-config'
import { assertPublicProxyTarget, isSameOriginRequest } from './proxy_policy'

type UploadBody = {
  config?: Partial<ObjectStorageConfig>
  ext?: string
  folder?: 'thumbnails' | 'videos'
  dataBase64?: string
}

type UploadResponse =
  | { ok: true; url: string }
  | { ok: false; error: string }

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024

type RequestHeaders = Record<string, string | string[] | undefined>

function firstHeader(headers: RequestHeaders | undefined, name: string): string {
  const value = headers?.[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function hasTrustedOrigin(headers: RequestHeaders | undefined): boolean {
  const origin = firstHeader(headers, 'origin')
  const host = firstHeader(headers, 'x-forwarded-host') || firstHeader(headers, 'host')
  const forwardedProtocol = firstHeader(headers, 'x-forwarded-proto')
  let protocol = forwardedProtocol
  if (!protocol && origin) {
    try {
      protocol = new URL(origin).protocol
    } catch {
      return false
    }
  }
  return isSameOriginRequest(origin, host, protocol || 'https')
}

function json(
  res: { status: (code: number) => { json: (payload: UploadResponse) => void } },
  status: number,
  payload: UploadResponse,
) {
  res.status(status).json(payload)
}

function decodeBase64(value: string): Uint8Array {
  const nodeBuffer = (globalThis as unknown as {
    Buffer?: { from: (input: string, encoding: 'base64') => Uint8Array }
  }).Buffer

  if (nodeBuffer) {
    return new Uint8Array(nodeBuffer.from(value, 'base64'))
  }

  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function resolveHttpStatus(err: unknown): number {
  const metadataStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
  if (typeof metadataStatus === 'number' && metadataStatus >= 400 && metadataStatus < 500) {
    return 400
  }
  return 500
}

export default async function handler(
  req: { method?: string; body?: unknown; headers?: RequestHeaders },
  res: {
    setHeader: (name: string, value: string) => void
    status: (code: number) => { json: (payload: UploadResponse) => void }
  },
) {
  if (!hasTrustedOrigin(req.headers)) {
    json(res, 403, { ok: false, error: 'Cross-origin storage access is not allowed' })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method Not Allowed' })
    return
  }

  const body = (() => {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body) as UploadBody
      } catch {
        return {} as UploadBody
      }
    }
    return (req.body ?? {}) as UploadBody
  })()
  const ext = typeof body.ext === 'string' ? body.ext : ''
  const folder = body.folder === 'videos' ? 'videos' : 'thumbnails'
  const dataBase64 = typeof body.dataBase64 === 'string' ? body.dataBase64 : ''
  if (!dataBase64) {
    json(res, 400, { ok: false, error: 'Missing media data' })
    return
  }
  if (Math.ceil(dataBase64.length * 3 / 4) > MAX_UPLOAD_BYTES) {
    json(res, 413, { ok: false, error: 'Media upload is too large' })
    return
  }

  try {
    const endpoint = body.config?.endpoint?.trim() || ''
    if (endpoint) {
      const endpointUrl = /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`
      await assertPublicProxyTarget(endpointUrl)
    }
    const storage = createObjectStorageFactory(body.config ?? null)
    if (!storage.enabled) {
      json(res, 400, { ok: false, error: 'Object storage is not configured' })
      return
    }
    const url = await storage.saveMedia({
      data: decodeBase64(dataBase64),
      ext,
      folder,
    })
    if (!url) {
      json(res, 400, { ok: false, error: 'Object storage is not configured' })
      return
    }

    json(res, 200, { ok: true, url })
  } catch (err: unknown) {
    const message = toErrorMessage(err) || 'Upload failed'
    const status = resolveHttpStatus(err)
    const safeConfig = {
      provider: body.config?.provider,
      endpoint: body.config?.endpoint,
      region: body.config?.region,
      bucket: body.config?.bucket,
      pathPrefix: body.config?.pathPrefix,
      forcePathStyle: body.config?.forcePathStyle,
      hasAccessKey: Boolean(body.config?.accessKeyId),
      hasSecretKey: Boolean(body.config?.secretAccessKey),
    }
    console.error('[api/storage] upload failed', { status, message, config: safeConfig })
    json(res, status, { ok: false, error: message })
  }
}
