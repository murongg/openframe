import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

type LookupAddress = { address: string; family: number }
export type ProxyLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<LookupAddress[]>

type ProxyPolicyDependencies = {
  lookup?: ProxyLookup
  fetchImpl?: typeof fetch
  maxRedirects?: number
}

const privateIpv4Networks = new BlockList()
const privateIpv6Networks = new BlockList()

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  privateIpv4Networks.addSubnet(network, prefix, 'ipv4')
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['100::', 64],
  ['2001:2::', 48],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  privateIpv6Networks.addSubnet(network, prefix, 'ipv6')
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '').toLowerCase()
}

export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = normalizeHostname(address.split('%')[0] ?? '')
  const family = isIP(normalized)
  if (family === 4) return privateIpv4Networks.check(normalized, 'ipv4')
  if (family === 6) return privateIpv6Networks.check(normalized, 'ipv6')
  return true
}

export function isSameOriginRequest(origin: string, host: string, protocol: string): boolean {
  if (!origin || !host) return false

  try {
    const parsed = new URL(origin)
    const normalizedProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`
    return parsed.protocol === normalizedProtocol && parsed.host === host
  } catch {
    return false
  }
}

export function assertProxyRequestBodyWithinLimit(
  body: string,
  encoding: 'base64' | 'text',
  maxBytes: number,
): void {
  const byteLength = encoding === 'text'
    ? new TextEncoder().encode(body).byteLength
    : Math.ceil(body.length * 3 / 4)
  if (byteLength > maxBytes) throw new Error('Proxy request is too large')
}

export async function assertPublicProxyTarget(
  rawUrl: string,
  lookup: ProxyLookup = dnsLookup,
): Promise<URL> {
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    throw new Error('Invalid target URL')
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('Only http/https proxy is allowed')
  }
  if (target.username || target.password) {
    throw new Error('Target URL credentials are not allowed')
  }

  const hostname = normalizeHostname(target.hostname)
  if (
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || hostname.endsWith('.internal')
  ) {
    throw new Error('Private network target is not allowed')
  }

  if (isIP(hostname)) {
    if (isPrivateNetworkAddress(hostname)) {
      throw new Error('Private network target is not allowed')
    }
    return target
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new Error('Private network target is not allowed')
  }

  return target
}

export async function fetchPublicProxyTarget(
  rawUrl: string,
  init: RequestInit,
  dependencies: ProxyPolicyDependencies = {},
): Promise<Response> {
  const lookup = dependencies.lookup ?? dnsLookup
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const maxRedirects = dependencies.maxRedirects ?? 3
  let target = await assertPublicProxyTarget(rawUrl, lookup)

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetchImpl(target, {
      ...init,
      redirect: 'manual',
    })
    if (response.status < 300 || response.status >= 400) return response

    const location = response.headers.get('location')
    if (!location) return response
    if (redirectCount === maxRedirects) throw new Error('Too many proxy redirects')
    target = await assertPublicProxyTarget(new URL(location, target).toString(), lookup)
  }

  throw new Error('Too many proxy redirects')
}

export async function readResponseBodyWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length') || '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('Proxy response is too large')
  }
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      throw new Error('Proxy response is too large')
    }
    chunks.push(value)
  }

  const result = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
