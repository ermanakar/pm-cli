import { LLMMessage } from './llm';

export class ContextManager {
    private messages: LLMMessage[] = [];
    private readonly maxHistory: number;

    constructor(maxHistory: number = 20) {
        this.maxHistory = maxHistory;
    }

    /**
     * Initialize a fresh context with a system prompt.
     */
    initialize(systemPrompt: string) {
        this.messages = [
            { role: 'system', content: systemPrompt }
        ];
    }

    /**
     * Add a message to the history.
     */
    addMessage(role: 'user' | 'assistant' | 'system' | 'tool', content: string, toolCalls?: any[], toolCallId?: string, name?: string) {
        const msg: LLMMessage = { role, content };
        if (toolCalls) msg.tool_calls = toolCalls;
        if (toolCallId) msg.tool_call_id = toolCallId;
        if (name) msg.name = name;

        this.messages.push(msg);
        this.prune();
    }

    /**
     * Get the current message history.
     */
    getMessages(): LLMMessage[] {
        return [...this.messages];
    }

    /**
     * Prune history to keep it within limits.
     * Always keeps the system prompt (index 0).
     */
    private prune() {
        if (this.messages.length > this.maxHistory + 1) { // +1 for system prompt
            // Keep system prompt, remove oldest messages after it
            const system = this.messages[0];
            const recent = this.messages.slice(-(this.maxHistory));
            this.messages = [system, ...recent];
        }
    }
}
