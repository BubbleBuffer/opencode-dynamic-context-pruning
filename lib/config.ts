// lib/config.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { parse } from 'jsonc-parser'
import { Logger } from './logger'
import type { PluginInput } from '@opencode-ai/plugin'

// Pruning strategy types
export type PruningStrategy = "deduplication" | "ai-analysis"

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    protectedTools: string[]
    model?: string // Format: "provider/model" (e.g., "anthropic/claude-haiku-4-5")
    showModelErrorToasts?: boolean // Show toast notifications when model selection fails
    pruning_summary: "off" | "minimal" | "detailed" // UI summary display mode
    strategies: {
        // Strategies for automatic pruning (on session idle). Empty array = idle pruning disabled
        onIdle: PruningStrategy[]
        // Strategies for the AI-callable tool. Empty array = tool not exposed to AI
        onTool: PruningStrategy[]
    }
}

export interface ConfigResult {
    config: PluginConfig
    migrations: string[] // List of migration messages to show user
}

const defaultConfig: PluginConfig = {
    enabled: true, // Plugin is enabled by default
    debug: false, // Disable debug logging by default
    protectedTools: ['task', 'todowrite', 'todoread', 'context_pruning'], // Tools that should never be pruned
    showModelErrorToasts: true, // Show model error toasts by default
    pruning_summary: 'detailed', // Default to detailed summary
    strategies: {
        // Default: Full analysis on idle (like previous "smart" mode)
        onIdle: ['deduplication', 'ai-analysis'],
        // Default: Only deduplication when AI calls the tool (faster, no extra LLM cost)
        onTool: ['deduplication']
    }
}

// Valid top-level keys in the current config schema
const VALID_CONFIG_KEYS = new Set([
    'enabled',
    'debug',
    'protectedTools',
    'model',
    'showModelErrorToasts',
    'pruning_summary',
    'strategies'
])

const GLOBAL_CONFIG_DIR = join(homedir(), '.config', 'opencode')
const GLOBAL_CONFIG_PATH_JSONC = join(GLOBAL_CONFIG_DIR, 'dcp.jsonc')
const GLOBAL_CONFIG_PATH_JSON = join(GLOBAL_CONFIG_DIR, 'dcp.json')

/**
 * Searches for .opencode directory starting from current directory and going up
 * Returns the path to .opencode directory if found, null otherwise
 */
function findOpencodeDir(startDir: string): string | null {
    let current = startDir
    while (current !== '/') {
        const candidate = join(current, '.opencode')
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
            return candidate
        }
        const parent = dirname(current)
        if (parent === current) break // Reached root
        current = parent
    }
    return null
}

/**
 * Determines which config file to use (prefers .jsonc, falls back to .json)
 * Checks both project-level and global configs
 */
function getConfigPaths(ctx?: PluginInput): { global: string | null, project: string | null } {
    // Global config paths
    let globalPath: string | null = null
    if (existsSync(GLOBAL_CONFIG_PATH_JSONC)) {
        globalPath = GLOBAL_CONFIG_PATH_JSONC
    } else if (existsSync(GLOBAL_CONFIG_PATH_JSON)) {
        globalPath = GLOBAL_CONFIG_PATH_JSON
    }

    // Project config paths (if context provided)
    let projectPath: string | null = null
    if (ctx?.directory) {
        const opencodeDir = findOpencodeDir(ctx.directory)
        if (opencodeDir) {
            const projectJsonc = join(opencodeDir, 'dcp.jsonc')
            const projectJson = join(opencodeDir, 'dcp.json')
            if (existsSync(projectJsonc)) {
                projectPath = projectJsonc
            } else if (existsSync(projectJson)) {
                projectPath = projectJson
            }
        }
    }

    return { global: globalPath, project: projectPath }
}

/**
 * Creates the default configuration file with helpful comments
 */
function createDefaultConfig(): void {
    // Ensure the directory exists
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
        mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true })
    }

    const configContent = `{
  // Enable or disable the Dynamic Context Pruning plugin
  "enabled": true,

  // Enable debug logging to ~/.config/opencode/logs/dcp/
  // Outputs include:
  // - daily/YYYY-MM-DD.log (plugin activity, decisions, errors)
  // - ai-context/*.json (messages sent to AI after pruning)
  "debug": false,

  // Optional: Specify a model to use for analysis instead of the session model
  // Format: "provider/model" (same as agent model config in opencode.jsonc)
  // NOTE: Anthropic OAuth sonnet 4+ tier models are currently not supported
  // "model": "anthropic/claude-haiku-4-5",

  // Show toast notifications when model selection fails and falls back
  // Set to false to disable these informational toasts
  "showModelErrorToasts": true,

  // Pruning strategies configuration
  // Available strategies: "deduplication", "ai-analysis"
  // Empty array = disabled
  "strategies": {
    // Strategies to run when session goes idle (automatic)
    "onIdle": ["deduplication", "ai-analysis"],
    
    // Strategies to run when AI calls the context_pruning tool
    // Empty array = tool not exposed to AI
    "onTool": ["deduplication"]
  },

  // Pruning summary display mode:
  // "off": No UI summary (silent pruning)
  // "minimal": Show tokens saved and count (e.g., "Saved ~2.5K tokens (6 tools pruned)")
  // "detailed": Show full breakdown by tool type and pruning method (default)
  "pruning_summary": "detailed",

  // List of tools that should never be pruned from context
  // "task": Each subagent invocation is intentional
  // "todowrite"/"todoread": Stateful tools where each call matters
  // "context_pruning": The pruning tool itself
  "protectedTools": ["task", "todowrite", "todoread", "context_pruning"]
}
`

    writeFileSync(GLOBAL_CONFIG_PATH_JSONC, configContent, 'utf-8')
}

/**
 * Loads a single config file and parses it
 */
function loadConfigFile(configPath: string): Record<string, any> | null {
    try {
        const fileContent = readFileSync(configPath, 'utf-8')
        return parse(fileContent)
    } catch (error: any) {
        return null
    }
}

/**
 * Check if config has any unknown or deprecated keys
 */
function getInvalidKeys(config: Record<string, any>): string[] {
    const invalidKeys: string[] = []
    for (const key of Object.keys(config)) {
        if (!VALID_CONFIG_KEYS.has(key)) {
            invalidKeys.push(key)
        }
    }
    return invalidKeys
}

/**
 * Backs up existing config and creates fresh default config
 * Returns the backup path if successful, null if failed
 */
function backupAndResetConfig(configPath: string, logger: Logger): string | null {
    try {
        const backupPath = configPath + '.bak'
        
        // Create backup
        copyFileSync(configPath, backupPath)
        logger.info('config', 'Created config backup', { backup: backupPath })
        
        // Write fresh default config
        createDefaultConfig()
        logger.info('config', 'Created fresh default config', { path: GLOBAL_CONFIG_PATH_JSONC })
        
        return backupPath
    } catch (error: any) {
        logger.error('config', 'Failed to backup/reset config', { error: error.message })
        return null
    }
}

/**
 * Merge strategies config, handling partial overrides
 */
function mergeStrategies(
    base: PluginConfig['strategies'],
    override?: Partial<PluginConfig['strategies']>
): PluginConfig['strategies'] {
    if (!override) return base
    return {
        onIdle: override.onIdle ?? base.onIdle,
        onTool: override.onTool ?? base.onTool
    }
}

/**
 * Loads configuration with support for both global and project-level configs
 * 
 * Config resolution order:
 * 1. Start with default config
 * 2. Merge with global config (~/.config/opencode/dcp.jsonc)
 * 3. Merge with project config (.opencode/dcp.jsonc) if found
 * 
 * If config has invalid/deprecated keys, backs up and resets to defaults.
 * 
 * Project config overrides global config, which overrides defaults.
 * 
 * @param ctx - Plugin input context (optional). If provided, will search for project-level config.
 * @returns ConfigResult with merged configuration and any migration messages
 */
export function getConfig(ctx?: PluginInput): ConfigResult {
    let config = { ...defaultConfig, protectedTools: [...defaultConfig.protectedTools] }
    const configPaths = getConfigPaths(ctx)
    const logger = new Logger(true) // Always log config loading
    const migrations: string[] = []

    // 1. Load global config
    if (configPaths.global) {
        const globalConfig = loadConfigFile(configPaths.global)
        if (globalConfig) {
            // Check for invalid keys
            const invalidKeys = getInvalidKeys(globalConfig)
            
            if (invalidKeys.length > 0) {
                // Config has deprecated/unknown keys - backup and reset
                logger.info('config', 'Found invalid config keys', { keys: invalidKeys })
                const backupPath = backupAndResetConfig(configPaths.global, logger)
                if (backupPath) {
                    migrations.push(`Old config backed up to ${backupPath}`)
                }
                // Config is now reset to defaults, no need to merge
            } else {
                // Valid config - merge with defaults
                config = {
                    enabled: globalConfig.enabled ?? config.enabled,
                    debug: globalConfig.debug ?? config.debug,
                    protectedTools: globalConfig.protectedTools ?? config.protectedTools,
                    model: globalConfig.model ?? config.model,
                    showModelErrorToasts: globalConfig.showModelErrorToasts ?? config.showModelErrorToasts,
                    strategies: mergeStrategies(config.strategies, globalConfig.strategies as any),
                    pruning_summary: globalConfig.pruning_summary ?? config.pruning_summary
                }
                logger.info('config', 'Loaded global config', { path: configPaths.global })
            }
        }
    } else {
        // Create default global config if it doesn't exist
        createDefaultConfig()
        logger.info('config', 'Created default global config', { path: GLOBAL_CONFIG_PATH_JSONC })
    }

    // 2. Load project config (overrides global)
    if (configPaths.project) {
        const projectConfig = loadConfigFile(configPaths.project)
        if (projectConfig) {
            // Check for invalid keys
            const invalidKeys = getInvalidKeys(projectConfig)
            
            if (invalidKeys.length > 0) {
                // Project config has deprecated/unknown keys - just warn, don't reset project configs
                logger.warn('config', 'Project config has invalid keys (ignored)', { 
                    path: configPaths.project,
                    keys: invalidKeys 
                })
            } else {
                // Valid config - merge with current config
                config = {
                    enabled: projectConfig.enabled ?? config.enabled,
                    debug: projectConfig.debug ?? config.debug,
                    protectedTools: projectConfig.protectedTools ?? config.protectedTools,
                    model: projectConfig.model ?? config.model,
                    showModelErrorToasts: projectConfig.showModelErrorToasts ?? config.showModelErrorToasts,
                    strategies: mergeStrategies(config.strategies, projectConfig.strategies as any),
                    pruning_summary: projectConfig.pruning_summary ?? config.pruning_summary
                }
                logger.info('config', 'Loaded project config (overrides global)', { path: configPaths.project })
            }
        }
    } else if (ctx?.directory) {
        logger.debug('config', 'No project config found', { searchedFrom: ctx.directory })
    }

    return { config, migrations }
}
