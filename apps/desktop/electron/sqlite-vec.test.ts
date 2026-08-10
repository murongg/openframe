import { describe, expect, it } from 'vitest'

import { resolveSqliteVecExtensionPath } from './sqlite-vec'

describe('resolveSqliteVecExtensionPath', () => {
  it('uses the unpacked native extension path in packaged apps', () => {
    expect(resolveSqliteVecExtensionPath(
      '/Applications/Openframe.app/Contents/Resources/app.asar/node_modules/sqlite-vec-darwin-arm64/vec0.dylib',
      true,
    )).toBe(
      '/Applications/Openframe.app/Contents/Resources/app.asar.unpacked/node_modules/sqlite-vec-darwin-arm64/vec0.dylib',
    )
  })

  it('supports packaged Windows paths', () => {
    expect(resolveSqliteVecExtensionPath(
      String.raw`C:\Program Files\Openframe\resources\app.asar\node_modules\sqlite-vec-windows-x64\vec0.dll`,
      true,
    )).toBe(
      String.raw`C:\Program Files\Openframe\resources\app.asar.unpacked\node_modules\sqlite-vec-windows-x64\vec0.dll`,
    )
  })

  it('keeps development paths unchanged', () => {
    const developmentPath = '/workspace/node_modules/sqlite-vec-darwin-arm64/vec0.dylib'

    expect(resolveSqliteVecExtensionPath(developmentPath, false)).toBe(developmentPath)
  })
})
