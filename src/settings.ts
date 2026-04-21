import fs from "fs"
import path from "path"
import { REVISION } from "./version"

interface VuetaleConfig {
    hytaleJarLocation?: string
    serverModsLocation?: string
    resourcesLocation?: string
    revision: number
}

export const VUETALE_CONFIG_PATH = ".vuetale"

export function getConfigPath(rootPath: string): string {
    return path.resolve(rootPath, VUETALE_CONFIG_PATH, 'config.json')
}

function getDefaultConfig(): VuetaleConfig {
    return {
        revision: REVISION,
    }
}

export function getOrCreateConfig(root: string): VuetaleConfig {
    let config = readConfig(root)
    if (!config) {
        config = getDefaultConfig()
        writeConfig(root, config)
    }
    return config
}

export function readConfig(root: string): VuetaleConfig | null {
    if (!fs.existsSync(root)) {
        return null
    }
    const content = fs.readFileSync(root, 'utf-8')
    try {
        const config = JSON.parse(content)
        if (typeof config.revision !== 'number') {
            throw new Error("Invalid config: missing or non-numeric 'revision'")
        }
        return config
    } catch (e) {
        console.error(`Failed to parse config at ${root}:`, e)
        return null
    }
}

export function writeConfig(root: string, config: VuetaleConfig) {
    const dir = path.dirname(root)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(root, JSON.stringify(config, null, 2), 'utf-8')
}

export function readProjectConfig(rootPath: string): VuetaleConfig | null {
    return readConfig(getConfigPath(rootPath))
}

export function generateTsConfig(rootPath: string) {
    const tsconfigPath = path.resolve(rootPath, VUETALE_CONFIG_PATH, 'tsconfig.vuetale.json')
    const aliasesPath = path.resolve(rootPath, VUETALE_CONFIG_PATH, 'aliases.json')

    let aliases = {} as Record<string, string>
    if (fs.existsSync(aliasesPath)) {
        try {
            const content = fs.readFileSync(aliasesPath, 'utf-8')
            aliases = JSON.parse(content)
        } catch (e) {
            console.error(`Failed to parse aliases at ${aliasesPath}:`, e)
        }
    }

    let newAliases = {} as Record<string, string[]>

    for (const [key, value] of Object.entries(aliases)) {
        const modName = `vt:@${key}`
        newAliases[modName] = [value + "/index.d.ts"]
        newAliases[modName + "/*"] = [value + "/*"]
    }

    const tsconfig = {
        "include": [
            "./modules/**/*.d.ts",
        ],
        "exclude": [],
        "compilerOptions": {
            "paths": {
                "@/*": [
                    "../lib/*"
                ],
                ...newAliases
            }
        }
    }

    const dir = path.dirname(tsconfigPath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8')
}
