import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveLegacySettingsFiles, resolveSettingsDirectory } from './settings_path'

describe('settings storage path', () => {
  it('does not depend on Electron package or display names', () => {
    expect(resolveSettingsDirectory('/application-data')).toBe(
      path.join('/application-data', 'openframe'),
    )
  })

  it('recognizes the settings location used by older package identities', () => {
    expect(resolveLegacySettingsFiles('/application-data')).toContain(
      path.join('/application-data', '@openframe', 'desktop', 'settings.json'),
    )
    expect(resolveLegacySettingsFiles('/application-data')).toContain(
      path.join('/application-data', 'Openframe', 'settings.json'),
    )
  })
})
