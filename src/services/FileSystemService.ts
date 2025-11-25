import fs from 'fs-extra';
import { SafetyService } from './SafetyService.js';
import path from 'path';

import ignore from 'ignore';

export class FileSystemService {
    private ig = ignore();
    private hasLoadedIgnore = false;

    constructor(private safetyService: SafetyService) { }

    private async loadIgnore() {
        if (this.hasLoadedIgnore) return;
        try {
            const gitignorePath = path.join(process.cwd(), '.gitignore');
            if (await fs.pathExists(gitignorePath)) {
                const content = await fs.readFile(gitignorePath, 'utf-8');
                this.ig.add(content);
            }
            // Always ignore .git and node_modules
            this.ig.add(['.git', 'node_modules', 'dist', '.DS_Store']);
            this.hasLoadedIgnore = true;
        } catch (e) {
            console.warn('Failed to load .gitignore', e);
        }
    }

    async readFile(filePath: string, truncate = true): Promise<string> {
        const content = await fs.readFile(filePath, 'utf-8');
        if (truncate && content.length > 10000) { // ~2500 tokens
            return content.slice(0, 10000) + '\n... [File truncated due to size. Use read_outline or read specific lines]';
        }
        return content;
    }

    async readOutline(filePath: string): Promise<string> {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const outline: string[] = [];

        // Simple regex heuristics for "structure"
        const structureRegex = /^(import|export|class|function|interface|type|const|let|var|def|class|struct|func)\s/i;

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (structureRegex.test(trimmed) || trimmed.endsWith('{') || trimmed.endsWith(':')) {
                outline.push(`${index + 1}: ${line}`);
            }
        });

        return outline.join('\n');
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        this.safetyService.validateWrite(filePath);
        await fs.outputFile(filePath, content);
    }

    async listDir(dirPath: string): Promise<string[]> {
        await this.loadIgnore();
        const files = await fs.readdir(dirPath);
        const relativeDir = path.relative(process.cwd(), dirPath);

        return files.filter(file => {
            const relPath = relativeDir ? path.join(relativeDir, file) : file;
            return !this.ig.ignores(relPath);
        });
    }

    async exists(filePath: string): Promise<boolean> {
        return fs.pathExists(filePath);
    }
}
