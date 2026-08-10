export function isAllowedExternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function isTrustedRendererUrl(candidateUrl: string, rendererUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const renderer = new URL(rendererUrl)
    if (renderer.protocol === 'file:') {
      return candidate.protocol === 'file:'
        && candidate.host === renderer.host
        && candidate.pathname === renderer.pathname
    }
    return candidate.origin === renderer.origin
  } catch {
    return false
  }
}
