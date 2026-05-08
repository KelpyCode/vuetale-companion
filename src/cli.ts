#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cpy from 'cpy'
import { VERSION } from './version'
import { isViteProject } from './util'
import { generateTsConfig, getConfigPath, getOrCreateConfig, writeConfig } from './settings'
import { main as extractDts, removeAlias } from './extract-dts'

const program = new Command()
const cwd = process.cwd()
const cliCwd = path.dirname(fileURLToPath(import.meta.url))


function regenerateTsConfig(projectRoot: string) {
    const spinner2 = ora("Generating tsconfig.vuetale.json ...").start()
    try {
        generateTsConfig(projectRoot)
        spinner2.succeed('tsconfig.vuetale.json generated successfully')
    }
    catch (err) {
        spinner2.fail('Failed to generate tsconfig.vuetale.json')
        console.error(chalk.red(`${err instanceof Error ? err.message : String(err)}`))
        process.exit(1)
    }
}

const ascii = ` __      __         _        _      
 \\ \\    / /        | |      | |     
  \\ \\  / /   _  ___| |_ __ _| | ___ 
   \\ \\/ / | | |/ _ \\ __/ _\` | |/ _ \\
    \\  /| |_| |  __/ || (_| | |  __/
     \\/  \\__,_|\\___|\\__\\__,_|_|\\___|`


program
    .name('vuetale')
    .description('A companion library for Vuetale.')
    .version(VERSION)




program
    .command("install")
    .description("Installs Vuetale project configuration to the given project directory.")
    .argument("[projectRoot]", "The directory of the project to install the configuration to.")
    .option('-p, --path <path>', 'Project root path', cwd)
    .action(async function (projectRoot) {
        const { path: pathOpt } = this.opts<{ path: string }>()
        const p = path.resolve(cwd, projectRoot ?? pathOpt)
        const spinner = ora(`Installing Vuetale configuration to ${p}...`).start()

        try {
            await cpy([
                path.resolve(cliCwd, '..', 'assets', '.vscode'),
            ], p)
        } catch (err) {
            console.error(chalk.red(`Failed to install configuration: ${err instanceof Error ? err.message : String(err)}`))
            process.exit(1)
        }

        spinner.stop()

        regenerateTsConfig(p)


        console.log(chalk.green(`Vuetale configuration installed successfully to ${p}!`))
    })

const config = program
    .command('config')
    .description('Manage Vuetale project config values.')
    .argument('[projectDir]', 'The project directory to manage config for (must be a Vite project)')

config
    .command('hytale-jar')
    .description('Set hytaleJarLocation in .vuetale/config.json')
    .argument('<path>', 'Path to the hytale jar or resources directory')
    .option('-p, --path <path>', 'Project root path', cwd)
    .action(function (targetPath) {
        const { path: pathOpt } = this.opts<{ path: string }>()
        const projectRoot = pathOpt
        if (!isViteProject(projectRoot)) {
            console.error(chalk.red(`Not a Vite project: ${projectRoot}`))
            process.exit(1)
        }

        const configPath = getConfigPath(projectRoot)
        const config = getOrCreateConfig(configPath)
        config.hytaleJarLocation = targetPath
        writeConfig(configPath, config)

        console.log(chalk.green(`Set hytaleJarLocation to ${targetPath}`))
    })

config
    .command('server-mods')
    .description('Set serverModsLocation in .vuetale/config.json')
    .argument('<path>', 'Path to a folder containing server mod jars')
    .option('-p, --path <path>', 'Project root path', cwd)
    .action(function (targetPath) {
        const { path: pathOpt } = this.opts<{ path: string }>()
        const projectRoot = pathOpt
        if (!isViteProject(projectRoot)) {
            console.error(chalk.red(`Not a Vite project: ${projectRoot}`))
            process.exit(1)
        }

        const configPath = getConfigPath(projectRoot)
        const config = getOrCreateConfig(configPath)
        config.serverModsLocation = targetPath
        writeConfig(configPath, config)

        console.log(chalk.green(`Set serverModsLocation to ${targetPath}`))
    })

config
    .command('resources')
    .description('Set resourcesLocation in .vuetale/config.json')
    .argument('<path>', 'Path to the resources directory')
    .option('-p, --path <path>', 'Project root path', cwd)
    .action(function (targetPath) {
        const { path: pathOpt } = this.opts<{ path: string }>()
        const projectRoot = pathOpt
        if (!isViteProject(projectRoot)) {
            console.error(chalk.red(`Not a Vite project: ${projectRoot}`))
            process.exit(1)
        }

        const configPath = getConfigPath(projectRoot)
        const config = getOrCreateConfig(configPath)
        config.resourcesLocation = targetPath
        writeConfig(configPath, config)

        console.log(chalk.green(`Set resourcesLocation to ${targetPath}`))
    })

program
    .command('dev')
    .description('Enable or disable dev mode. When enabled, creates vuetale-dev.properties next to the server mods folder.')
    .argument('<enabled>', 'true or false')
    .option('-p, --path <path>', 'Project root path', cwd)
    .action(function (enabled) {
        const { path: pathOpt } = this.opts<{ path: string }>()
        const projectRoot = pathOpt
        if (!isViteProject(projectRoot)) {
            console.error(chalk.red(`Not a Vite project: ${projectRoot}`))
            process.exit(1)
        }

        const configPath = getConfigPath(projectRoot)
        const config = getOrCreateConfig(configPath)

        if (enabled !== 'true' && enabled !== 'false') {
            console.error(chalk.red('Argument must be true or false'))
            process.exit(1)
        }

        if (!config.serverModsLocation) {
            console.error(chalk.red('serverModsLocation is not set. Run: vuetale config server-mods <path>'))
            process.exit(1)
        }

        const propertiesFile = path.resolve(config.serverModsLocation, '..', 'vuetale-dev.properties')

        if (enabled === 'true') {
            if (!config.resourcesLocation) {
                console.error(chalk.red('resourcesLocation is not set. Run: vuetale config resources <path>'))
                process.exit(1)
            }
            const content = `vuetale.devResourcesPath=${config.resourcesLocation.replaceAll("\\", "/")}\nvuetale.devVue=true\n`
            fs.writeFileSync(propertiesFile, content, 'utf-8')
            console.log(chalk.green(`Dev mode enabled. Written to ${propertiesFile}`))
        } else {
            if (fs.existsSync(propertiesFile)) {
                fs.rmSync(propertiesFile)
                console.log(chalk.green(`Dev mode disabled. Removed ${propertiesFile}`))
            } else {
                console.log(chalk.yellow(`Dev mode already disabled (file not found: ${propertiesFile})`))
            }
        }
    })

program
    .command('extract')
    .description('Extract Vuetale .d.ts modules into <path>/.vuetale/modules')
    .argument('[path]', 'Vite project root path where output should be written')
    .argument('[modFileName]', 'Optional mod jar file name to extract (with or without .jar)')
    .option('-p, --path <path>', 'Project root path', cwd)
    .option('-c, --clean', 'Fully regenerate .vuetale/aliases.json instead of merging existing aliases')
    .action(async function (targetRoot, modFileName) {
        const { clean, path: pathOpt } = this.opts<{ clean?: boolean, path: string }>()
        const projectRoot = path.resolve(cwd, targetRoot ?? pathOpt)
        if (!isViteProject(projectRoot)) {
            console.error(chalk.red(`Not a Vite project: ${projectRoot}`))
            process.exit(1)
        }

        let spinner = ora(`Extracting d.ts modules to ${projectRoot}/.vuetale/modules ...`).start()
        try {
            await extractDts(projectRoot, { modFileName, clean: clean ?? false })
            spinner.succeed('Extraction complete')
        } catch (err) {
            spinner.fail('Extraction failed')
            console.error(chalk.red(`${err instanceof Error ? err.message : String(err)}`))
            process.exit(1)
        }

        regenerateTsConfig(projectRoot)
    })

program
    .command('remove')
    .description('Remove a single Vuetale alias and its module (example: vuetale remove @core)')
    .argument('<alias>', 'Alias to remove (with or without @ prefix)')
    .option('-p, --path <path>', 'Project root path', cwd)
    .action(function (alias) {
        const { path: pathOpt } = this.opts<{ path: string }>()
        const projectRoot = pathOpt
        if (!isViteProject(projectRoot)) {
            console.error(chalk.red(`Not a Vite project: ${projectRoot}`))
            process.exit(1)
        }

        const spinner = ora(`Removing alias ${alias} ...`).start()
        try {
            removeAlias(projectRoot, alias)
            spinner.succeed(`Removed alias ${alias}`)
        } catch (err) {
            spinner.fail('Remove failed')
            console.error(chalk.red(`${err instanceof Error ? err.message : String(err)}`))
            process.exit(1)
        }

        regenerateTsConfig(projectRoot)
    })

console.log(chalk.magenta(chalk.bold(ascii)))
console.log(chalk.gray(chalk.bold(`         Vuetale CLI ` + chalk.green("v" + VERSION))) + "\n")

program.parse(process.argv)

