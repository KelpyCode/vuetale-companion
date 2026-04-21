/**
 * extract-dts.ts
 *
 *  1. Scans a list of source locations (JAR files or local resource directories).
 *  2. Finds `vuetale/<alias>/` resource trees inside each, extracting:
 *       - All `.d.ts` files
 *       - The `manifest.json` describing the mod's components/pages/huds
 *  3. Writes everything into `.vuetale/modules/@<alias>/` so TypeScript and Vite's
 *     `resolve.alias` can satisfy `import ... from '@core/components/Foo'`.
 *  4. Generates a `tsconfig.paths.json` snippet that can be merged into
 *     `tsconfig.app.json` via the `extends` array or a reference include.
 *
 * ### Configuration
 * Source paths are read from `.vuetale/config.json` through `settings.ts`:
 *  - `hytaleJarLocation`: path to a JAR or resource directory
 *  - `serverModsLocation`: path to a directory containing JAR files
 *
 * ### Run
 * ```bash
 * cd src/vuetale
 * npx tsx scripts/extract-dts.ts
 * # or add to package.json:  "extract-dts": "tsx scripts/extract-dts.ts"
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readProjectConfig, VUETALE_CONFIG_PATH } from './settings';

// ---------------------------------------------------------------------------
// Optional JSZip – only used when a JAR source is listed.
// Install with: pnpm add -D jszip
// ---------------------------------------------------------------------------
let JSZip: typeof import('jszip') | undefined;
try {
    const req = createRequire(import.meta.url);
    JSZip = req('jszip');
} catch {
    // JSZip unavailable – JAR extraction will be skipped with a warning.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveSrc(p: string, rootPath: string) {
    return path.resolve(rootPath, p);
}

function ensureDir(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeFile(dest: string, content: string | Buffer) {
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, content);
}

interface VuetaleManifest {
    name: string;
    version: string;
    description?: string;
    components: string[];
    pages: string[];
    huds: string[];
}

interface ExtractedModule {
    alias: string;
    manifest?: VuetaleManifest;
    dtsFiles: Array<{ relativePath: string; content: string }>;
}

interface SourceConfig {
    hytaleJarLocation?: string;
    serverModsLocation?: string;
}

interface ExtractOptions {
    modFileName?: string;
    clean?: boolean;
}

// ---------------------------------------------------------------------------
// Source: local resource directory
// ---------------------------------------------------------------------------
function extractFromDir(resourceRoot: string): ExtractedModule[] {
    const vtDir = path.join(resourceRoot, 'vuetale');
    if (!fs.existsSync(vtDir)) return [];

    const results: ExtractedModule[] = [];

    for (const alias of fs.readdirSync(vtDir)) {
        const aliasDir = path.join(vtDir, alias);
        if (!fs.statSync(aliasDir).isDirectory()) continue;

        const mod: ExtractedModule = { alias, dtsFiles: [] };

        // manifest.json
        const manifestPath = path.join(aliasDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            mod.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        }

        // Walk for .d.ts files
        walkDir(aliasDir, (filePath) => {
            if (!filePath.endsWith('.d.ts')) return;
            const relative = path.relative(aliasDir, filePath).replaceAll('\\', '/');
            mod.dtsFiles.push({ relativePath: relative, content: fs.readFileSync(filePath, 'utf-8') });
        });

        results.push(mod);
    }

    return results;
}

function walkDir(dir: string, cb: (filePath: string) => void) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkDir(full, cb);
        else cb(full);
    }
}

// ---------------------------------------------------------------------------
// Source: JAR file
// ---------------------------------------------------------------------------
async function extractFromJar(jarPath: string): Promise<ExtractedModule[]> {
    if (!JSZip) {
        console.warn(`[extract-dts] JSZip not found – skipping JAR: ${jarPath}`);
        console.warn(`               Install it with: pnpm add -D jszip`);
        return [];
    }

    if (!fs.existsSync(jarPath)) {
        console.warn(`[extract-dts] JAR not found, skipping: ${jarPath}`);
        return [];
    }

    const zipData = fs.readFileSync(jarPath);
    const zip = await (JSZip as any).loadAsync(zipData);

    const byAlias = new Map<string, ExtractedModule>();

    for (const [name, file] of Object.entries(zip.files) as [string, any][]) {
        if (file.dir) continue;

        const match = name.match(/^vuetale\/([^/]+)\/(.+)$/);
        if (!match) continue;

        const [, alias, relPath] = match;

        if (!byAlias.has(alias)) byAlias.set(alias, { alias, dtsFiles: [] });
        const mod = byAlias.get(alias)!;

        if (relPath === 'manifest.json') {
            const text = await file.async('string');
            mod.manifest = JSON.parse(text);
        } else if (relPath.endsWith('.d.ts')) {
            const text = await file.async('string');
            mod.dtsFiles.push({ relativePath: relPath, content: text });
        }
    }

    return Array.from(byAlias.values());
}

// ---------------------------------------------------------------------------
// Write extracted module into .vuetale/modules/@<alias>
// ---------------------------------------------------------------------------
function writeModulePackage(mod: ExtractedModule, rootPath: string) {
    const pkgDir = path.join(rootPath, VUETALE_CONFIG_PATH, 'modules', `@${mod.alias}`);
    ensureDir(pkgDir);

    // package.json
    const pkg = {
        name: `@${mod.alias}`,
        version: mod.manifest?.version ?? '0.0.0',
        description: mod.manifest?.description ?? `Vuetale module: ${mod.alias}`,
        types: 'index.d.ts',
    };
    writeFile(path.join(pkgDir, 'package.json'), JSON.stringify(pkg, null, 2));

    // .d.ts files
    for (const { relativePath, content } of mod.dtsFiles) {
        writeFile(path.join(pkgDir, relativePath), content);
    }

    // Barrel index.d.ts if none extracted
    const indexDts = path.join(pkgDir, 'index.d.ts');
    if (!fs.existsSync(indexDts)) {
        const exports = (mod.manifest?.components ?? [])
            .concat(mod.manifest?.pages ?? [])
            .concat(mod.manifest?.huds ?? []);
        const lines = exports.map(e => `export * from './${e}';`).join('\n');
        writeFile(indexDts, lines || '// no exports\n');
    }

    console.log(`[extract-dts] Wrote @${mod.alias} (${mod.dtsFiles.length} .d.ts files)`);
}

function writeModulesIndex(modules: ExtractedModule[], rootPath: string) {
    const uniqueAliases = Array.from(new Set(modules.map(mod => mod.alias))).sort();
    const lines = uniqueAliases.map(alias => `export * from './@${alias}/index';`);
    const dest = path.join(rootPath, VUETALE_CONFIG_PATH, 'modules', 'index.d.ts');
    writeFile(dest, lines.join('\n') + '\n');
    console.log(`[extract-dts] Wrote .vuetale/modules/index.d.ts`);
}

function writeModulesIndexFromAliases(aliases: string[], rootPath: string) {
    const lines = aliases.map(alias => `export * from './@${alias}/index';`);
    const dest = path.join(rootPath, VUETALE_CONFIG_PATH, 'modules', 'index.d.ts');
    writeFile(dest, lines.join('\n') + '\n');
    console.log(`[extract-dts] Wrote .vuetale/modules/index.d.ts`);
}

function writeAliases(modules: ExtractedModule[], rootPath: string, clean: boolean) {
    const aliasesPath = path.join(rootPath, VUETALE_CONFIG_PATH, 'aliases.json');

    const generatedAliases: Record<string, string> = {};
    for (const alias of Array.from(new Set(modules.map(mod => mod.alias))).sort()) {
        generatedAliases[alias] = `./modules/@${alias}`;
    }

    let existingAliases: Record<string, string> = {};
    if (!clean && fs.existsSync(aliasesPath)) {
        try {
            existingAliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
        } catch (err) {
            console.warn(`[extract-dts] Failed to parse existing aliases.json, using empty map: ${aliasesPath}`);
            console.warn(err);
        }
    }

    const mergedAliases = clean
        ? generatedAliases
        : {
            ...existingAliases,
            ...generatedAliases,
        };

    const sortedAliases = Object.fromEntries(
        Object.entries(mergedAliases).sort(([a], [b]) => a.localeCompare(b)),
    );

    writeFile(aliasesPath, JSON.stringify(sortedAliases, null, 2) + '\n');
    console.log(`[extract-dts] ${clean ? 'Regenerated' : 'Merged'} .vuetale/aliases.json (${Object.keys(sortedAliases).length} alias(es))`);
}

function normalizeAliasName(alias: string): string {
    return alias.trim().replace(/^@/, '');
}

function getModuleAliasesFromDisk(rootPath: string): string[] {
    const modulesDir = path.join(rootPath, VUETALE_CONFIG_PATH, 'modules');
    if (!fs.existsSync(modulesDir) || !fs.statSync(modulesDir).isDirectory()) return [];

    return fs.readdirSync(modulesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('@'))
        .map(entry => entry.name.slice(1))
        .sort((a, b) => a.localeCompare(b));
}

export function removeAlias(rootPath: string = process.cwd(), aliasInput: string) {
    const alias = normalizeAliasName(aliasInput);
    if (!alias) {
        throw new Error('Alias is required');
    }

    const moduleDir = path.join(rootPath, VUETALE_CONFIG_PATH, 'modules', `@${alias}`);
    const aliasesPath = path.join(rootPath, VUETALE_CONFIG_PATH, 'aliases.json');

    let removedModule = false;
    if (fs.existsSync(moduleDir)) {
        fs.rmSync(moduleDir, { recursive: true, force: true });
        removedModule = true;
        console.log(`[extract-dts] Removed module directory: .vuetale/modules/@${alias}`);
    }

    let removedAlias = false;
    let aliases: Record<string, string> = {};
    if (fs.existsSync(aliasesPath)) {
        try {
            aliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
        } catch {
            throw new Error(`Failed to parse aliases at ${aliasesPath}`);
        }

        if (alias in aliases) {
            delete aliases[alias];
            removedAlias = true;

            const sortedAliases = Object.fromEntries(
                Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)),
            );
            writeFile(aliasesPath, JSON.stringify(sortedAliases, null, 2) + '\n');
            console.log(`[extract-dts] Removed alias '${alias}' from .vuetale/aliases.json`);
        }
    }

    if (!removedModule && !removedAlias) {
        throw new Error(`Alias not found: ${aliasInput}`);
    }

    const remainingAliases = getModuleAliasesFromDisk(rootPath);
    writeModulesIndexFromAliases(remainingAliases, rootPath);
}



// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function main(rootPath: string = process.cwd(), options: ExtractOptions = {}) {
    const clean = options.clean ?? false;
    const sources = getSourcesFromSettings(rootPath, options.modFileName);
    if (sources.length === 0) {
        console.log(`[extract-dts] No sources found in .vuetale/config.json`);
        return;
    }

    const ownModName = readOwnModName(rootPath);

    const allModules: ExtractedModule[] = [];

    for (const src of sources) {
        const abs = resolveSrc(src, rootPath);
        const isJar = abs.endsWith('.jar');
        console.log(`[extract-dts] Scanning ${isJar ? 'JAR' : 'dir'}: ${abs}`);

        const mods = isJar
            ? await extractFromJar(abs)
            : extractFromDir(abs);

        for (const mod of mods) {
            if (ownModName && mod.alias === ownModName) {
                console.log(`[extract-dts] Skipping own module: @${mod.alias}`);
                continue;
            }
            allModules.push(mod);
        }
    }

    if (allModules.length === 0) {
        console.log(`[extract-dts] No Vuetale modules found. Check .vuetale/config.json settings.`);
        return;
    }

    for (const mod of allModules) {
        writeModulePackage(mod, rootPath);
    }

    writeModulesIndex(allModules, rootPath);
    writeAliases(allModules, rootPath, clean);

    console.log(`[extract-dts] Done. ${allModules.length} module(s) processed.`);
}

const isDirectRun = process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;

if (isDirectRun) {
    main().catch(err => {
        console.error('[extract-dts] Fatal error:', err);
        process.exit(1);
    });
}

function getSourcesFromSettings(rootPath: string, modFileName?: string): string[] {
    const cfg = readProjectConfig(rootPath) as SourceConfig | null;
    if (!cfg) return [];

    const sources = new Set<string>();

    if (cfg.hytaleJarLocation) {
        sources.add(resolveSrc(cfg.hytaleJarLocation, rootPath));
    }

    if (cfg.serverModsLocation) {
        const modsDir = resolveSrc(cfg.serverModsLocation, rootPath);
        if (fs.existsSync(modsDir) && fs.statSync(modsDir).isDirectory()) {
            for (const entry of fs.readdirSync(modsDir, { withFileTypes: true })) {
                if (!entry.isFile() || !entry.name.endsWith('.jar')) continue;
                sources.add(path.join(modsDir, entry.name));
            }
        }
    }

    const resolvedSources = Array.from(sources);
    if (!modFileName) return resolvedSources;

    const wanted = normalizeModName(modFileName);
    return resolvedSources.filter(sourcePath => {
        const fileName = path.basename(sourcePath);
        return normalizeModName(fileName) === wanted;
    });
}

function normalizeModName(name: string): string {
    return name.toLowerCase().replace(/\.jar$/, '');
}

function readOwnModName(rootPath: string): string | null {
    const pluginJsonPath = path.join(rootPath, 'lib', 'vuetale-plugin.json');
    if (!fs.existsSync(pluginJsonPath)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
        return typeof data.name === 'string' ? data.name : null;
    } catch {
        return null;
    }
}

