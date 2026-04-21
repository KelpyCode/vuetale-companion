import fs from "fs"
import path from "path"
import { VUETALE_CONFIG_PATH } from "./settings"

export function isMavenProject(root: string): boolean {
    const pomPath = path.join(root, 'pom.xml')
    return fs.existsSync(pomPath)
}

export function isGradleProject(root: string): boolean {
    const gradlePath = path.join(root, 'build.gradle')
    const gradleKtsPath = path.join(root, 'build.gradle.kts')
    return fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)
}

export function isJavaProject(root: string): boolean {
    return isMavenProject(root) || isGradleProject(root)
}

export function isViteProject(root: string): boolean {
    const viteConfigPath = path.join(root, 'vite.config.ts')
    const viteConfigJsPath = path.join(root, 'vite.config.js')
    return fs.existsSync(viteConfigPath) || fs.existsSync(viteConfigJsPath)
}

export function isVuetaleViteProject(root: string): boolean {
    const viteConfigPath = path.join(root, VUETALE_CONFIG_PATH)
    if (!fs.existsSync(viteConfigPath)) return false
    return true
}

