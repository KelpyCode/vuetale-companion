import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: {
    customExports: {
      './types/elements': './dist/types/elements.d.mts',
    },
  },
  clean: true,
  platform: 'node',
  entry: [
    'src/index.ts',
    'src/vite.ts',
    'src/cli.ts',
    'src/types/elements.d.ts',
    'src/vite/AssetSyncPlugin.ts',
    'src/vite/CssBuildPlugin.ts',
    'src/vite/HmrIdsPlugin.ts',
    'src/vite/VuetalePlugin.ts',
  ],

  deps: {
    neverBundle: ['vite', 'vue'],
  },
  copy: [
    'assets',
    //'src/types'
  ]
  // ...config options
})
