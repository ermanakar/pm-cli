import path from 'path';
import fs from 'fs-extra';
import { FileSystemService } from './FileSystemService.js';
import { LLMService, ChatMessage } from './LLMService.js';
import { ContextService } from './ContextService.js';

export class InvestigatorService {
    constructor(
        private fileSystem: FileSystemService,
        private llm: LLMService,
        private contextService: ContextService
    ) { }

    async analyze(input: string): Promise<string> {
        // 1. Check if input is a file path
        const absolutePath = path.resolve(process.cwd(), input);
        const exists = await this.fileSystem.exists(absolutePath);

        if (exists) {
            const stats = await fs.stat(absolutePath);
            if (stats.isDirectory()) {
                return this.analyzeDirectory(absolutePath);
            } else {
                return this.readFileContext(absolutePath);
            }
        }

        // 2. If not a file, treat as a query using Project Context
        return this.answerQuery(input);
    }

    private async analyzeDirectory(dirPath: string): Promise<string> {
        const files = await this.fileSystem.listDir(dirPath);
        return `Directory Analysis for ${dirPath}:\n\nFiles:\n${files.join('\n')}`;
    }

    async readFileContext(filePath: string): Promise<string> {
        try {
            const content = await this.fileSystem.readFile(filePath);
            return `File: ${filePath}\n\n\`\`\`\n${content}\n\`\`\``;
        } catch (error) {
            return `Error reading file ${filePath}: ${error}`;
        }
    }

    private async answerQuery(query: string): Promise<string> {
        const context = await this.contextService.getContext();
        const contextStr = context ? JSON.stringify(context, null, 2) : 'No project context found. Run /init to set up.';

        const prompt: ChatMessage[] = [
            {
                role: 'system',
                content: `You are PMX Investigator. Answer the user's question about the codebase based on the provided project context.
                
                Project Context:
                ${contextStr}`
            },
            { role: 'user', content: query }
        ];

        return await this.llm.chatCompletion(prompt) || "I couldn't generate an answer.";
    }
}
