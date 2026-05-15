import { cpSync, existsSync, rmSync } from 'node:fs'
import type { Plugin } from 'vite'


export function AssetSyncPlugin(sourceDir: string, targetDir: string): Plugin {
    return {
        name: 'vuetale-asset-sync',
        apply: 'build',
        writeBundle() {
            if (!existsSync(sourceDir)) return

            // Keep destination clean so deleted assets are removed too.
            rmSync(targetDir, { recursive: true, force: true })
            cpSync(sourceDir, targetDir, { recursive: true })
        },
    }
}