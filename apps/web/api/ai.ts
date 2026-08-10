import {
  assertProxyRequestBodyWithinLimit,
  fetchPublicProxyTarget,
  isSameOriginRequest,
  readResponseBodyWithinLimit,
} from './proxy_policy'

type ProxyRequestBody = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  bodyEncoding?: 'base64' | 'text'
}

type ProxyResponseBody = {
  ok: true
  status: number
  headers: Record<string, string>
  body: string
  bodyEncoding: 'base64'
} | {
  ok: false
  error: string
}

const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE'])
const MAX_PROXY_BODY_BYTES = 64 * 1024 * 1024
const MAX_PROXY_RESPONSE_BYTES = 64 * 1024 * 1024
const PROXY_TIMEOUT_MS = 5 * 60 * 1000

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

function normalizeHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const input = raw as Record<string, unknown>
  const out: Record<string, string> = {}

  Object.entries(input).forEach(([key, value]) => {
    if (typeof value !== 'string') return
    const headerName = key.trim()
    if (!headerName) return

    const lower = headerName.toLowerCase()
    if (
      lower === 'host'
      || lower === 'content-length'
      || lower === 'connection'
      || lower === 'cookie'
      || lower === 'origin'
      || lower === 'referer'
      || lower === 'forwarded'
      || lower.startsWith('x-forwarded-')
    ) return

    out[headerName] = value
  })

  return out
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

function encodeBase64(value: Uint8Array): string {
  const nodeBuffer = (globalThis as unknown as {
    Buffer?: {
      from: (input: Uint8Array) => { toString: (encoding: 'base64') => string }
    }
  }).Buffer

  if (nodeBuffer) {
    return nodeBuffer.from(value).toString('base64')
  }

  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < value.length; index += chunkSize) {
    const chunk = value.subarray(index, Math.min(index + chunkSize, value.length))
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function decodeForwardBody(body: ProxyRequestBody): BodyInit | undefined {
  if (!body.body) return undefined
  const encoding = body.bodyEncoding === 'text' ? 'text' : 'base64'
  assertProxyRequestBodyWithinLimit(body.body, encoding, MAX_PROXY_BODY_BYTES)
  if (encoding === 'text') return body.body

  try {
    const bytes = decodeBase64(body.body)
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return copy.buffer
  } catch {
    throw new Error('Invalid base64 body')
  }
}

function toSerializableHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function json(
  res: { status: (code: number) => { json: (payload: ProxyResponseBody) => void } },
  status: number,
  payload: ProxyResponseBody,
) {
  res.status(status).json(payload)
}

export default async function handler(
  req: { method?: string; body?: unknown; headers?: RequestHeaders },
  res: {
    setHeader: (name: string, value: string) => void
    status: (code: number) => { json: (payload: ProxyResponseBody) => void }
  },
) {
  if (!hasTrustedOrigin(req.headers)) {
    json(res, 403, { ok: false, error: 'Cross-origin proxy access is not allowed' })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method Not Allowed' })
    return
  }

  const body = (req.body ?? {}) as Partial<ProxyRequestBody>
  const targetRaw = typeof body.url === 'string' ? body.url : ''
  if (!targetRaw) {
    json(res, 400, { ok: false, error: 'Missing target url' })
    return
  }

  try {
    const method = typeof body.method === 'string' && body.method ? body.method.toUpperCase() : 'GET'
    if (!ALLOWED_METHODS.has(method)) {
      json(res, 405, { ok: false, error: 'Proxy method is not allowed' })
      return
    }
    const headers = normalizeHeaders(body.headers)
    const forwardBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : decodeForwardBody(body as ProxyRequestBody)

    const upstream = await fetchPublicProxyTarget(targetRaw, {
      method,
      headers,
      body: forwardBody,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    })

    const bytes = await readResponseBodyWithinLimit(upstream, MAX_PROXY_RESPONSE_BYTES)

    json(res, 200, {
      ok: true,
      status: upstream.status,
      headers: toSerializableHeaders(upstream.headers),
      body: encodeBase64(bytes),
      bodyEncoding: 'base64',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    json(res, 400, { ok: false, error: message })
  }
}
