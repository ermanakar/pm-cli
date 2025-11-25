import { LLMService, ChatMessage } from './LLMService.js';
import { FileSystemService } from './FileSystemService.js';
import { ContextService } from './ContextService.js';
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
        private contextService: ContextService
    ) { }

    async investigate(
        objective: string,
        onUpdate?: (status: string) => void,
        onConfirm?: (tool: string, args: any) => Promise<boolean>
    ): Promise<string> {
        const context = await this.contextService.getContext();
        const contextStr = context ? JSON.stringify(context) : 'No context yet.';

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `You are PMX Investigator, an autonomous agent.
        Your goal is to answer the user's objective by exploring the codebase.
        
        Project Context: ${contextStr}
        
        Tools available:
        - list_files(path): See what's in a folder (ignores .gitignore).
        - read_file(path): Read file content.
        - read_outline(path): Read structure of large files.
        - write_file(path, content): Create/Update documentation. 
          RESTRICTION: You can ONLY write to 'docs/', '.pmx/', 'PMX.md', or 'README.md'. 
          DO NOT try to modify source code (src/, lib/, etc).
        - search_files(pattern): Find code.

        Strategy:
        1. Explore relevant directories.
        2. Read key files. Use read_outline for big files.
        3. Synthesize an answer.
        
        Be concise and efficient.`
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

            const response = await this.llm.chatCompletionWithTools(messages, this.tools);

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
