const PACKED_ASAR_SEGMENT = /([\\/])app\.asar\1/

export function resolveSqliteVecExtensionPath(
  extensionPath: string,
  isPackaged: boolean,
): string {
  if (!isPackaged) return extensionPath

  // Native SQLite cannot dlopen Electron's virtual asar path; electron-builder places it beside the archive.
  return extensionPath.replace(PACKED_ASAR_SEGMENT, '$1app.asar.unpacked$1')
}
