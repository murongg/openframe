import { describe, expect, it, vi } from 'vitest'

import {
  assertProxyRequestBodyWithinLimit,
  assertPublicProxyTarget,
  fetchPublicProxyTarget,
  isPrivateNetworkAddress,
  isSameOriginRequest,
  readResponseBodyWithinLimit,
} from './proxy_policy'

describe('proxy policy', () => {
  it('measures text request limits in UTF-8 bytes', () => {
    expect(() => assertProxyRequestBodyWithinLimit('你好', 'text', 5)).toThrow(
      'Proxy request is too large',
    )
    expect(() => assertProxyRequestBodyWithinLimit('你好', 'text', 6)).not.toThrow()
  })

  it('accepts only requests from the served origin', () => {
    expect(isSameOriginRequest('https://openframe.example.test', 'openframe.example.test', 'https')).toBe(true)
    expect(isSameOriginRequest('https://attacker.example.test', 'openframe.example.test', 'https')).toBe(false)
    expect(isSameOriginRequest('', 'openframe.example.test', 'https')).toBe(false)
  })

  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '100.64.0.1',
    '169.254.169.254',
    '192.168.1.2',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks private network address %s', (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true)
  })

  it('allows a public network address', () => {
    expect(isPrivateNetworkAddress('93.184.216.34')).toBe(false)
  })

  it('resolves hostnames before allowing a proxy target', async () => {
    const lookup = vi.fn().mockResolvedValue([{ address: '10.1.2.3', family: 4 }])

    await expect(assertPublicProxyTarget('https://api.example.test/v1', lookup)).rejects.toThrow(
      'Private network target is not allowed',
    )
    expect(lookup).toHaveBeenCalledWith('api.example.test', { all: true, verbatim: true })
  })

  it('rejects oversized upstream responses while streaming', async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]))

    await expect(readResponseBodyWithinLimit(response, 3)).rejects.toThrow('Proxy response is too large')
  })

  it('revalidates redirect destinations before following them', async () => {
    const lookup = vi.fn().mockImplementation(async (hostname: string) => (
      hostname === 'api.example.test'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }]
    ))
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://localhost/admin' },
    }))

    await expect(fetchPublicProxyTarget(
      'https://api.example.test/v1',
      { method: 'GET' },
      { lookup, fetchImpl },
    )).rejects.toThrow('Private network target is not allowed')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
