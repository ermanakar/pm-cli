import fs from 'fs-extra';
import path from 'path';
import { SafetyService } from './SafetyService.js';

import os from 'os';

interface PMXConfig {
    projectType?: 'frontend' | 'backend' | 'fullstack';
    contextFiles?: string[];
    exclude?: string[];
    mcpServers?: Record<string, MCPServerConfig>;
}

export interface MCPServerConfig {
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
}

interface GlobalConfig {
    openaiApiKey?: string;
}

export class ConfigService {
    private configPath: string;
    private globalConfigPath: string;
    private config: PMXConfig = {};
    private globalConfig: GlobalConfig = {};

    constructor(private rootDir: string = process.cwd(), private safetyService: SafetyService) {
        this.configPath = path.join(rootDir, '.pmx', 'config.json');
        this.globalConfigPath = path.join(os.homedir(), '.pmx-global', 'config.json');
    }

    async loadConfig(): Promise<PMXConfig> {
        try {
            if (await fs.pathExists(this.configPath)) {
                this.config = await fs.readJson(this.configPath);
            }
            if (await fs.pathExists(this.globalConfigPath)) {
                this.globalConfig = await fs.readJson(this.globalConfigPath);
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
        return this.config;
    }

    async saveConfig(newConfig: Partial<PMXConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };
        await fs.ensureDir(path.dirname(this.configPath));
        this.safetyService.validateWrite(this.configPath);
        await fs.writeJson(this.configPath, this.config, { spaces: 2 });
    }

    async saveGlobalConfig(newConfig: Partial<GlobalConfig>): Promise<void> {
        this.globalConfig = { ...this.globalConfig, ...newConfig };
        await fs.ensureDir(path.dirname(this.globalConfigPath));
        // Global config is outside project, so we skip safetyService check or add an exception
        // For now, direct write is fine as it's in user home
        await fs.writeJson(this.globalConfigPath, this.globalConfig, { spaces: 2 });
    }

    getConfig(): PMXConfig {
        return this.config;
    }

    getGlobalConfig(): GlobalConfig {
        return this.globalConfig;
    }
}
