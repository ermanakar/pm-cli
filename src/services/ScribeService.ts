import path from 'path';
import { FileSystemService } from './FileSystemService.js';
import { LLMService, ChatMessage } from './LLMService.js';

export class ScribeService {
    constructor(
        private fileSystem: FileSystemService,
        private llm: LLMService
    ) { }

    async generateArtifact(type: string, topic: string, context: string): Promise<string> {
        const prompt: ChatMessage[] = [
            {
                role: 'system',
                content: `You are PMX Scribe, an expert product manager assistant. 
        Your task is to create a ${type} about "${topic}".
        Use the provided context to inform your writing.
        Output in Markdown format.`
            },
            {
                role: 'user',
                content: `Context:\n${context}\n\nTopic: ${topic}`
            }
        ];

        const content = await this.llm.chatCompletion(prompt);
        if (!content) throw new Error('Failed to generate content');

        const filename = `docs/${type.toLowerCase()}-${topic.replace(/\s+/g, '-').toLowerCase()}.md`;
        await this.fileSystem.writeFile(filename, content);

        return filename;
    }
}
