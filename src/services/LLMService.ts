import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export class LLMService {
    private openai: OpenAI | null = null;
    private model: string = 'gpt-4-turbo-preview'; // Default to a good model

    constructor(apiKey?: string) {
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (key) {
            this.openai = new OpenAI({ apiKey: key });
        } else {
            // Don't warn here, let the UI handle it
        }
    }

    setApiKey(apiKey: string) {
        this.openai = new OpenAI({ apiKey });
    }

    isReady(): boolean {
        return this.openai !== null;
    }

    async chatCompletion(messages: ChatMessage[]): Promise<string | null> {
        if (!this.openai) {
            return "Error: OpenAI API Key is missing. Please set OPENAI_API_KEY environment variable.";
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: messages as any,
            });
            return response.choices[0]?.message?.content || null;
        } catch (error) {
            console.error('LLM Error:', error);
            throw error;
        }
    }

    async chatCompletionWithTools(messages: ChatMessage[], tools: any[]): Promise<{ content: string | null, tool_calls?: any[] } | null> {
        if (!this.openai) {
            return { content: "Error: OpenAI API Key is missing." };
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: messages as any,
                tools: tools,
                tool_choice: 'auto'
            });
            return response.choices[0]?.message || null;
        } catch (error) {
            console.error('LLM Tools Error:', error);
            throw error;
        }
    }

    async streamChatCompletion(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<void> {
        if (!this.openai) {
            onChunk("Error: OpenAI API Key is missing. Please set OPENAI_API_KEY environment variable.");
            return;
        }
        try {
            const stream = await this.openai.chat.completions.create({
                model: this.model,
                messages: messages as any,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    onChunk(content);
                }
            }
        } catch (error) {
            console.error('LLM Stream Error:', error);
            throw error;
        }
    }
}
