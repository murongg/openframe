import { describe, expect, it } from 'vitest'

import { isAllowedExternalUrl, isTrustedRendererUrl } from './security'

describe('desktop security policy', () => {
  it('allows only http and https external URLs', () => {
    expect(isAllowedExternalUrl('https://example.test/release')).toBe(true)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///tmp/example')).toBe(false)
  })

  it('allows the packaged renderer file and rejects other local files', () => {
    const rendererUrl = 'file:///Applications/Openframe.app/Contents/Resources/app.asar/dist/index.html'

    expect(isTrustedRendererUrl(`${rendererUrl}#/projects`, rendererUrl)).toBe(true)
    expect(isTrustedRendererUrl('file:///tmp/untrusted.html', rendererUrl)).toBe(false)
    expect(
      isTrustedRendererUrl(
        'file://fileserver/Applications/Openframe.app/Contents/Resources/app.asar/dist/index.html',
        rendererUrl,
      ),
    ).toBe(false)
  })

  it('allows only the configured development server origin', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/#/projects', 'http://localhost:5173/')).toBe(true)
    expect(isTrustedRendererUrl('https://example.test/', 'http://localhost:5173/')).toBe(false)
  })
})
