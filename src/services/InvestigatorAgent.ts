import { LLMService, ChatMessage } from './LLMService.js';
import { FileSystemService } from './FileSystemService.js';
import { ContextService } from './ContextService.js';
import { MCPService } from './MCPService.js';
import { MemoryService } from './MemoryService.js';
import path from 'path';

interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

export class InvestigatorAgent {
    private tools = [
        {
            type: 'function',
            function: {
                name: 'list_files',
                description: 'List files in a directory. Use this to explore the project structure.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Directory path (relative to root)' }
                    },
                    required: ['path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_file',
                description: 'Read the content of a file. (Automatically truncated if too large)',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path (relative to root)' }
                    },
                    required: ['path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'read_outline',
                description: 'Read only the structure (imports, classes, functions) of a file. Use this for LARGE files to save tokens.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path (relative to root)' }
                    },
                    required: ['path']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'write_file',
                description: 'Write content to a file. REQUIRES USER APPROVAL.',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'File path (relative to root)' },
                        content: { type: 'string', description: 'Content to write' }
                    },
                    required: ['path', 'content']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'search_files',
                description: 'Search for a string pattern in files.',
                parameters: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Regex or string pattern' },
                        path: { type: 'string', description: 'Directory to search in (default: .)' }
                    },
                    required: ['pattern']
                }
            }
        }
    ];

    constructor(
        private llm: LLMService,
        private fileSystem: FileSystemService,
        private contextService: ContextService,
        private mcpService: MCPService,
        private memoryService?: MemoryService
    ) { }

    async investigate(
        objective: string,
        onUpdate?: (status: string) => void,
        onConfirm?: (tool: string, args: any) => Promise<boolean>
    ): Promise<string> {
        const context = await this.contextService.getContext();
        const contextStr = context ? JSON.stringify(context) : 'No context yet.';

        // Get strategic memory context
        let memoryContext = '';
        if (this.memoryService) {
            memoryContext = await this.memoryService.getContextForAgent();
        }

        // Get MCP tools to include in system prompt
        let mcpToolsDescription = '';
        let hasJiraTools = false;
        try {
            const mcpTools = await this.mcpService.getTools();
            if (mcpTools.length > 0) {
                hasJiraTools = mcpTools.some((t: any) => t.function.name.startsWith('jira_'));
                mcpToolsDescription = `

        ═══════════════════════════════════════════════════════════════
        EXTERNAL TOOLS (YOU ARE CONNECTED - USE THEM!)
        ═══════════════════════════════════════════════════════════════
        ${mcpTools.map((t: any) => `- ${t.function.name}: ${t.function.description || 'No description'}`).join('\n        ')}
        
        ⚠️  CRITICAL: You ARE connected to these external services. You CAN and MUST use these tools.
        - When asked to create a Jira ticket: CALL jira_create_issue with the required fields.
        - When asked to search/list issues: CALL jira_search.
        - When asked about projects: CALL jira_get_all_projects.
        
        DO NOT say "I can't access Jira" or "I don't have access". YOU DO. Call the tool!`;
            }
        } catch (e) {
            // MCP tools not available
        }

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `You are PMX, an autonomous agent with FULL ACCESS to external tools.
        
        PROJECT CONTEXT: ${contextStr}
        ${memoryContext ? `
        ═══════════════════════════════════════════════════════════════
        STRATEGIC MEMORY (OKRs, Decisions, Risks, Personas)
        ═══════════════════════════════════════════════════════════════
        ${memoryContext}
        ` : ''}
        FILE SYSTEM TOOLS:
        - list_files(path): See what's in a folder.
        - read_file(path): Read file content.
        - read_outline(path): Read structure of large files.
        - write_file(path, content): Write documentation files only.
        - search_files(pattern): Find code.${mcpToolsDescription}

        ═══════════════════════════════════════════════════════════════
        RULES:
        1. When asked to DO something (create ticket, etc.): CALL THE TOOL. Do not describe what you would do.
        2. You have function calling capability. Use it.
        3. If you need info before calling a tool, ask the user - don't pretend you can't use tools.
        ═══════════════════════════════════════════════════════════════`
            },
            { role: 'user', content: objective }
        ];

        let turns = 0;
        const maxTurns = 30;

        while (turns < maxTurns) {
            turns++;

            // We need to access the raw OpenAI client for tools, but LLMService wraps it.
            // For this lean implementation, we'll extend LLMService or use a raw call if needed.
            // Assuming LLMService needs an update to support tools, or we hack it here.
            // Let's update LLMService to support tools properly in the next step.
            // For now, I'll assume we update LLMService.

            // Fetch MCP tools and merge
            let availableTools = [...this.tools];
            try {
                const mcpTools = await this.mcpService.getTools();
                availableTools = [...availableTools, ...mcpTools];
            } catch (e) {
                console.error("Failed to fetch MCP tools:", e);
            }

            const response = await this.llm.chatCompletionWithTools(messages, availableTools);

            if (!response) return "Failed to get response from LLM.";

            const { content, tool_calls } = response;

            // Show the agent's thought process (content) to the user
            if (content) {
                onUpdate?.(`Thinking: ${content}`);
            } else {
                onUpdate?.(`Thinking (Turn ${turns})...`);
            }

            messages.push({ role: 'assistant', content, tool_calls } as any);

            if (!tool_calls || tool_calls.length === 0) {
                return content || "Investigation complete.";
            }

            for (const toolCall of tool_calls) {
                const fnName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                let result = '';

                // Show what tool is being executed
                onUpdate?.(`Executing: ${fnName}(${JSON.stringify(args)})`);

                try {
                    if (fnName === 'list_files') {
                        const files = await this.fileSystem.listDir(path.resolve(process.cwd(), args.path || '.'));
                        result = files.join('\n');
                    } else if (fnName === 'read_file') {
                        result = await this.fileSystem.readFile(path.resolve(process.cwd(), args.path));
                    } else if (fnName === 'read_outline') {
                        result = await this.fileSystem.readOutline(path.resolve(process.cwd(), args.path));
                    } else if (fnName === 'write_file') {
                        if (onConfirm) {
                            const approved = await onConfirm(fnName, args);
                            if (approved) {
                                await this.fileSystem.writeFile(path.resolve(process.cwd(), args.path), args.content);
                                result = `File ${args.path} written successfully.`;
                            } else {
                                result = `User denied write access to ${args.path}.`;
                            }
                        } else {
                            result = "Write not supported in this mode (no confirmation callback provided).";
                        }
                    } else if (fnName === 'search_files') {
                        // Lean implementation: grep via shell or simple read? 
                        // Let's use a simple grep-like simulation or just fail for now if no grep tool.
                        // Actually, let's skip search for this lean version or implement a simple one.
                        result = "Search not implemented in lean mode yet. Use list/read.";
                    } else {
                        // Try MCP tools
                        try {
                            result = await this.mcpService.callTool(fnName, args);
                        } catch (mcpError) {
                            // If it fails there too, then report error
                            result = `Error: Tool ${fnName} not found or failed. ${(mcpError as Error).message}`;
                        }
                    }
                } catch (e) {
                    result = `Error: ${(e as Error).message}`;
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    name: fnName,
                    content: result
                } as any);
            }
        }

        return "Max turns reached.";
    }
}
