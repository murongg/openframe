import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@openframe\/shared$/,
        replacement: fileURLToPath(new URL('./packages/shared/index.ts', import.meta.url)),
      },
      {
        find: /^@openframe\/shared\/object-storage-factory$/,
        replacement: fileURLToPath(
          new URL('./packages/shared/utils/object_storage_factory.ts', import.meta.url),
        ),
      },
      {
        find: /^@openframe\/shared\/object-storage-config$/,
        replacement: fileURLToPath(
          new URL('./packages/shared/utils/object_storage_config.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
