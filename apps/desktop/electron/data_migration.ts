import fs from 'node:fs/promises'
import path from 'node:path'

const DATA_ARTIFACT_NAMES = ['app.db', 'app.db-shm', 'app.db-wal', 'thumbnails', 'videos'] as const

type DataMigrationDependencies = {
  currentDir: string
  targetDir: string
  prepareTarget: (targetDir: string) => Promise<string>
  backupDatabase: (targetDatabasePath: string) => Promise<void>
  copyDirectory: (sourceDir: string, targetDir: string) => Promise<void>
  commitTarget: (stagingDir: string, targetDir: string) => Promise<void>
  cleanupTarget: (stagingDir: string) => Promise<void>
}

export function resolveDataDirectoryState(
  defaultDir: string,
  configuredDir: string,
  pendingDir: string,
): { currentDir: string; pendingDir: string } {
  const currentDir = path.resolve(configuredDir || defaultDir)
  const resolvedPendingDir = pendingDir ? path.resolve(pendingDir) : ''
  return {
    currentDir,
    pendingDir: resolvedPendingDir && resolvedPendingDir !== currentDir ? resolvedPendingDir : '',
  }
}

export async function commitDataDirectoryTarget(
  stagingDir: string,
  targetDir: string,
  preserveUnrelatedFiles: boolean,
): Promise<void> {
  if (!preserveUnrelatedFiles) {
    let targetEntries: string[] | null = null
    try {
      targetEntries = await fs.readdir(targetDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (targetEntries && targetEntries.length > 0) {
      throw new Error('The selected data directory is no longer empty')
    }
    if (targetEntries) await fs.rmdir(targetDir)
    await fs.rename(stagingDir, targetDir)
    return
  }

  // Electron's default userData directory also contains settings and Chromium state.
  // Replace only Openframe's project artifacts so those unrelated files survive a reset.
  await fs.mkdir(targetDir, { recursive: true })
  await Promise.all(DATA_ARTIFACT_NAMES.map((name) => (
    fs.rm(path.join(targetDir, name), { recursive: true, force: true })
  )))
  const stagingEntries = await fs.readdir(stagingDir)
  for (const entry of stagingEntries) {
    await fs.rename(path.join(stagingDir, entry), path.join(targetDir, entry))
  }
  await fs.rmdir(stagingDir)
}

export async function migrateDataDirectory({
  currentDir,
  targetDir,
  prepareTarget,
  backupDatabase,
  copyDirectory,
  commitTarget,
  cleanupTarget,
}: DataMigrationDependencies): Promise<void> {
  const resolvedCurrentDir = path.resolve(currentDir)
  const resolvedTargetDir = path.resolve(targetDir)
  if (resolvedCurrentDir === resolvedTargetDir) return
  const targetRelativeToCurrent = path.relative(resolvedCurrentDir, resolvedTargetDir)
  if (!targetRelativeToCurrent.startsWith('..') && !path.isAbsolute(targetRelativeToCurrent)) {
    throw new Error('The new data directory must be outside the current data directory')
  }

  const stagingDir = await prepareTarget(resolvedTargetDir)
  try {
    await backupDatabase(path.join(stagingDir, 'app.db'))
    await copyDirectory(
      path.join(resolvedCurrentDir, 'thumbnails'),
      path.join(stagingDir, 'thumbnails'),
    )
    await copyDirectory(
      path.join(resolvedCurrentDir, 'videos'),
      path.join(stagingDir, 'videos'),
    )
    await commitTarget(stagingDir, resolvedTargetDir)
  } catch (error) {
    await cleanupTarget(stagingDir)
    throw error
  }
}
