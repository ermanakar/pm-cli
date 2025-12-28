import { LLMService, ChatMessage } from './LLMService.js';

// ═══════════════════════════════════════════════════════════════
// INTENT TYPES
// ═══════════════════════════════════════════════════════════════

export type Intent =
    | { type: 'investigate'; query: string }
    | { type: 'plan'; feature: string }
    | { type: 'read'; path: string }
    | { type: 'init' }
    | { type: 'memory'; action: 'view' | 'add-okr' | 'add-decision' | 'add-risk' | 'add-persona'; data?: string }
    | { type: 'health'; quick?: boolean }
    | { type: 'jira'; action: 'create' | 'search' | 'list'; data?: string }
    | { type: 'mcp'; action: 'status' | 'connect' }
    | { type: 'help' }
    | { type: 'quit' }
    | { type: 'chat'; message: string }; // Fallback

// ═══════════════════════════════════════════════════════════════
// INTENT SERVICE
// ═══════════════════════════════════════════════════════════════

export class IntentService {
    constructor(private llm: LLMService) { }

    /**
     * Classifies user input into a structured intent.
     * Uses a focused LLM call for quick classification.
     */
    async classifyIntent(userInput: string): Promise<Intent> {
        // Quick pattern matching for common phrases (saves an LLM call)
        const quickMatch = this.quickPatternMatch(userInput);
        if (quickMatch) return quickMatch;

        // Use LLM for more complex intent detection
        return this.llmClassify(userInput);
    }

    /**
     * Fast pattern matching for common intents.
     * Returns null if no pattern matches.
     */
    private quickPatternMatch(input: string): Intent | null {
        const lower = input.toLowerCase().trim();

        // Exit commands
        if (['quit', 'exit', 'bye', 'goodbye'].includes(lower)) {
            return { type: 'quit' };
        }

        // Help commands
        if (['help', 'commands', 'what can you do', '?'].includes(lower)) {
            return { type: 'help' };
        }

        // Init patterns
        if (lower.includes('initialize') || lower.includes('set up') ||
            lower.includes('setup') || lower === 'scan' ||
            lower.includes('deep scan')) {
            return { type: 'init' };
        }

        // Health patterns
        if (lower.includes('health') || lower.includes('audit') ||
            lower.includes('check the codebase') || lower.includes('code quality')) {
            const quick = lower.includes('quick') || lower.includes('overview');
            return { type: 'health', quick };
        }

        // Memory/Goals patterns
        if (lower.includes('goals') || lower.includes('okr') ||
            lower.includes('objectives') || lower.includes('key results')) {
            if (lower.includes('add') || lower.includes('create') || lower.includes('new')) {
                const data = input.replace(/^.*?(add|create|new).*?(okr|goal|objective)?:?\s*/i, '').trim();
                return { type: 'memory', action: 'add-okr', data: data || undefined };
            }
            return { type: 'memory', action: 'view' };
        }

        if (lower.includes('decision') || lower.includes('decided')) {
            if (lower.includes('log') || lower.includes('record') || lower.includes('add')) {
                return { type: 'memory', action: 'add-decision' };
            }
            return { type: 'memory', action: 'view' };
        }

        if (lower.includes('risk')) {
            if (lower.includes('add') || lower.includes('new') || lower.includes('flag')) {
                return { type: 'memory', action: 'add-risk' };
            }
            return { type: 'memory', action: 'view' };
        }

        if (lower.includes('persona') || lower.includes('user type') || lower.includes('target user')) {
            if (lower.includes('add') || lower.includes('create') || lower.includes('new')) {
                return { type: 'memory', action: 'add-persona' };
            }
            return { type: 'memory', action: 'view' };
        }

        if (lower.includes('memory') || lower.includes('context') || lower.includes('what do you know')) {
            return { type: 'memory', action: 'view' };
        }

        // Jira patterns
        if (lower.includes('jira')) {
            if (lower.includes('create') || lower.includes('ticket') || lower.includes('issue')) {
                return { type: 'jira', action: 'create', data: input };
            }
            if (lower.includes('search') || lower.includes('find')) {
                return { type: 'jira', action: 'search', data: input };
            }
            if (lower.includes('list') || lower.includes('show')) {
                return { type: 'jira', action: 'list' };
            }
        }

        // MCP patterns
        if (lower.includes('mcp') || lower.includes('connection')) {
            if (lower.includes('status')) {
                return { type: 'mcp', action: 'status' };
            }
            if (lower.includes('connect') || lower.includes('reconnect')) {
                return { type: 'mcp', action: 'connect' };
            }
        }

        // Read file patterns
        const readMatch = lower.match(/^(read|show|open|view)\s+(the\s+)?(.+?)(\s+file)?$/i);
        if (readMatch) {
            return { type: 'read', path: readMatch[3].trim() };
        }

        // Investigate patterns (questions about the codebase)
        const investigatePatterns = [
            /^how (does|is|are|do)/i,
            /^what (is|are|does|do)/i,
            /^where (is|are|do|does)/i,
            /^why (is|are|do|does)/i,
            /^can you (explain|show|find|investigate)/i,
            /^tell me about/i,
            /^explain/i,
            /^analyze/i,
            /^investigate/i,
            /^look at/i,
            /^explore/i
        ];

        for (const pattern of investigatePatterns) {
            if (pattern.test(lower)) {
                return { type: 'investigate', query: input };
            }
        }

        // Plan patterns
        const planPatterns = [
            /^(i want to |let's |we should |can we )?(add|build|create|implement|make)/i,
            /^plan (for |a |an |the )?/i,
            /^draft (a |an )?(prd|spec|feature)/i,
            /^feature:?\s+/i
        ];

        for (const pattern of planPatterns) {
            if (pattern.test(lower)) {
                const feature = input.replace(pattern, '').trim();
                if (feature.length > 3) {
                    return { type: 'plan', feature };
                }
            }
        }

        // No quick match - fall through to LLM
        return null;
    }

    /**
     * Uses LLM for intent classification when pattern matching fails.
     */
    private async llmClassify(input: string): Promise<Intent> {
        const prompt: ChatMessage[] = [
            {
                role: 'system',
                content: `You are an intent classifier for a Product Management CLI tool.

Classify the user's input into ONE of these intents:
- investigate: Questions about the codebase (how things work, where to find things)
- plan: Requests to plan/design a new feature
- read: Request to read a specific file
- init: Request to initialize/scan the project
- memory: Request to view/manage goals, decisions, risks, personas
- health: Request to check codebase health/quality
- jira: Request related to Jira (create ticket, search issues)
- chat: General conversation that doesn't fit above categories

Respond with ONLY a JSON object:
{
  "intent": "<intent_type>",
  "data": "<extracted data if relevant, otherwise null>"
}

Examples:
- "How does the auth system work?" → {"intent": "investigate", "data": "auth system"}
- "I want to add dark mode" → {"intent": "plan", "data": "dark mode"}
- "Show me the UserService" → {"intent": "read", "data": "UserService"}
- "Create a ticket for the login bug" → {"intent": "jira", "data": "login bug"}
- "What are our current goals?" → {"intent": "memory", "data": "view-okrs"}
- "Hello, how are you?" → {"intent": "chat", "data": null}`
            },
            { role: 'user', content: input }
        ];

        try {
            const response = await this.llm.chatCompletion(prompt);
            if (!response) {
                return { type: 'chat', message: input };
            }

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { type: 'chat', message: input };
            }

            const parsed = JSON.parse(jsonMatch[0]);
            return this.mapParsedIntent(parsed, input);
        } catch (e) {
            // Fallback to chat on any error
            return { type: 'chat', message: input };
        }
    }

    /**
     * Maps parsed LLM response to structured Intent type.
     */
    private mapParsedIntent(parsed: { intent: string; data?: string }, originalInput: string): Intent {
        const data = parsed.data || originalInput;

        switch (parsed.intent) {
            case 'investigate':
                return { type: 'investigate', query: data };

            case 'plan':
                return { type: 'plan', feature: data };

            case 'read':
                return { type: 'read', path: data };

            case 'init':
                return { type: 'init' };

            case 'memory':
                if (data.includes('okr') || data.includes('goal')) {
                    return { type: 'memory', action: 'view' };
                }
                return { type: 'memory', action: 'view' };

            case 'health':
                return { type: 'health' };

            case 'jira':
                if (data.includes('create') || data.includes('ticket')) {
                    return { type: 'jira', action: 'create', data };
                }
                return { type: 'jira', action: 'search', data };

            case 'chat':
            default:
                return { type: 'chat', message: originalInput };
        }
    }

    /**
     * Returns a human-readable description of available intents.
     */
    getHelpText(): string {
        return `
╔══════════════════════════════════════════════════════════════╗
║  📚 PMX COMMANDS & CAPABILITIES                              ║
╠══════════════════════════════════════════════════════════════╣
║  You can use slash commands OR natural language:             ║
║                                                              ║
║  🔍 INVESTIGATE                                              ║
║  └── "How is authentication handled?"                        ║
║  └── /investigate <query>                                    ║
║                                                              ║
║  📝 SMART DOCS (PRDs, Tickets, Specs)                        ║
║  └── "Create a PRD for dark mode"                            ║
║  └── /scribe prd <topic>                                     ║
║  └── /scribe prd <topic> --sync   (Confluence + Jira)        ║
║  └── /scribe prd <topic> --jira   (Create tickets)           ║
║                                                              ║
║  📖 READ                                                     ║
║  └── "Show me the UserService"                               ║
║  └── /read <path>                                            ║
║                                                              ║
║  🎯 MEMORY (Goals, Decisions, Risks)                         ║
║  └── "What are our current goals?"                           ║
║  └── "Add a new OKR: Increase retention"                     ║
║  └── /memory                                                 ║
║                                                              ║
║  🩺 HEALTH                                                   ║
║  └── "Check the codebase health"                             ║
║  └── /health                                                 ║
║                                                              ║
║  🔧 SETUP                                                    ║
║  └── "Initialize the project"                                ║
║  └── /init                                                   ║
║                                                              ║
║  🔌 INTEGRATIONS                                             ║
║  └── /jira setup                                             ║
║  └── /mcp status                                             ║
╚══════════════════════════════════════════════════════════════╝`;
    }
}
