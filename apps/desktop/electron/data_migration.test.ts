import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  commitDataDirectoryTarget,
  migrateDataDirectory,
  resolveDataDirectoryState,
} from './data_migration'

describe('data directory migration', () => {
  it('keeps the active directory separate from a pending directory', () => {
    expect(resolveDataDirectoryState('/default', '/active', '/next')).toEqual({
      currentDir: '/active',
      pendingDir: '/next',
    })
  })

  it('hides a pending directory when it resolves to the active directory', () => {
    expect(resolveDataDirectoryState('/default', '', '/default')).toEqual({
      currentDir: '/default',
      pendingDir: '',
    })
  })

  it('rejects a target nested inside the active directory', async () => {
    const prepareTarget = vi.fn()

    await expect(migrateDataDirectory({
      currentDir: '/active',
      targetDir: '/active/archive',
      prepareTarget,
      backupDatabase: vi.fn(),
      copyDirectory: vi.fn(),
      commitTarget: vi.fn(),
      cleanupTarget: vi.fn(),
    })).rejects.toThrow('outside the current data directory')

    expect(prepareTarget).not.toHaveBeenCalled()
  })

  it('backs up the database and copies both media directories before switching', async () => {
    const prepareTarget = vi.fn().mockResolvedValue('/next.staging')
    const backupDatabase = vi.fn().mockResolvedValue(undefined)
    const copyDirectory = vi.fn().mockResolvedValue(undefined)
    const commitTarget = vi.fn().mockResolvedValue(undefined)
    const cleanupTarget = vi.fn().mockResolvedValue(undefined)

    await migrateDataDirectory({
      currentDir: '/active',
      targetDir: '/next',
      prepareTarget,
      backupDatabase,
      copyDirectory,
      commitTarget,
      cleanupTarget,
    })

    expect(prepareTarget).toHaveBeenCalledWith('/next')
    expect(backupDatabase).toHaveBeenCalledWith('/next.staging/app.db')
    expect(copyDirectory).toHaveBeenNthCalledWith(1, '/active/thumbnails', '/next.staging/thumbnails')
    expect(copyDirectory).toHaveBeenNthCalledWith(2, '/active/videos', '/next.staging/videos')
    expect(commitTarget).toHaveBeenCalledWith('/next.staging', '/next')
    expect(cleanupTarget).not.toHaveBeenCalled()
  })

  it('cleans staging data when a migration step fails', async () => {
    const cleanupTarget = vi.fn().mockResolvedValue(undefined)

    await expect(migrateDataDirectory({
      currentDir: '/active',
      targetDir: '/next',
      prepareTarget: vi.fn().mockResolvedValue('/next.staging'),
      backupDatabase: vi.fn().mockRejectedValue(new Error('backup failed')),
      copyDirectory: vi.fn(),
      commitTarget: vi.fn(),
      cleanupTarget,
    })).rejects.toThrow('backup failed')

    expect(cleanupTarget).toHaveBeenCalledWith('/next.staging')
  })

  it('replaces only known data artifacts when returning to the default directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openframe-data-migration-'))
    const targetDir = path.join(root, 'default')
    const stagingDir = path.join(root, 'staging')
    try {
      await fs.mkdir(path.join(targetDir, 'Cache'), { recursive: true })
      await fs.mkdir(path.join(targetDir, 'thumbnails'), { recursive: true })
      await fs.writeFile(path.join(targetDir, 'settings.json'), 'keep')
      await fs.writeFile(path.join(targetDir, 'app.db'), 'old')
      await fs.writeFile(path.join(targetDir, 'thumbnails', 'old.png'), 'old')

      await fs.mkdir(path.join(stagingDir, 'thumbnails'), { recursive: true })
      await fs.writeFile(path.join(stagingDir, 'app.db'), 'new')
      await fs.writeFile(path.join(stagingDir, 'thumbnails', 'new.png'), 'new')

      await commitDataDirectoryTarget(stagingDir, targetDir, true)

      expect(await fs.readFile(path.join(targetDir, 'settings.json'), 'utf8')).toBe('keep')
      expect(await fs.readFile(path.join(targetDir, 'app.db'), 'utf8')).toBe('new')
      expect(await fs.readFile(path.join(targetDir, 'thumbnails', 'new.png'), 'utf8')).toBe('new')
      await expect(fs.access(path.join(targetDir, 'thumbnails', 'old.png'))).rejects.toThrow()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
