import path from 'path';
import { FileSystemService } from './FileSystemService.js';
import { ConfigService } from './ConfigService.js';

export interface ProjectContext {
    name: string;
    description: string;
    architecture: string;
    domain: string;
    context: string;
    keyFiles: string[];
}

export class ContextService {
    private contextPath: string;

    constructor(
        private fileSystem: FileSystemService,
        private configService: ConfigService,
        private rootDir: string = process.cwd()
    ) {
        this.contextPath = path.join(rootDir, '.pmx', 'context.json');
    }

    async initializeContext(data: Partial<ProjectContext>): Promise<void> {
        const context: ProjectContext = {
            name: data.name || 'Unknown',
            description: data.description || '',
            architecture: data.architecture || '',
            domain: data.domain || '',
            context: data.context || '',
            keyFiles: data.keyFiles || []
        };
        await this.saveContext(context);
    }

    async getContext(): Promise<ProjectContext | null> {
        if (await this.fileSystem.exists(this.contextPath)) {
            const content = await this.fileSystem.readFile(this.contextPath);
            return JSON.parse(content);
        }
        return null;
    }

    async saveContext(context: ProjectContext): Promise<void> {
        await this.fileSystem.writeFile(this.contextPath, JSON.stringify(context, null, 2));
    }

    async updateContext(partial: Partial<ProjectContext>): Promise<void> {
        const current = await this.getContext() || {
            name: 'Unknown',
            description: '',
            architecture: '',
            domain: '',
            context: '',
            keyFiles: []
        };
        await this.saveContext({ ...current, ...partial });
    }
}
