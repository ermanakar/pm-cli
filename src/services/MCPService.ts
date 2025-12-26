import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ConfigService, MCPServerConfig } from './ConfigService.js';

export class MCPService {
    private clients: Map<string, Client> = new Map();
    private connectionErrors: Map<string, string> = new Map();

    constructor(private configService: ConfigService) { }

    async connectToServer(name: string, config: MCPServerConfig): Promise<void> {
        if (this.clients.has(name)) {
            console.log(`Already connected to ${name}`);
            return;
        }

        let transport;
        if (config.command) {
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...(config.env || {}) } as Record<string, string>
            });
        } else if (config.url) {
            transport = new SSEClientTransport(new URL(config.url));
        } else {
            throw new Error(`Invalid config for ${name}: must have command or url`);
        }

        const client = new Client({
            name: "pmx-client",
            version: "1.0.0",
        }, {
            capabilities: {
                sampling: {},
            }
        });

        try {
            await client.connect(transport);

            // Give the server a moment to fully initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Verify connection by testing listTools
            const testTools = await client.listTools();
            console.log(`Connected to MCP server: ${name}, tools available: ${testTools.tools?.length || 0}`);

            this.clients.set(name, client);
        } catch (error) {
            console.error(`Failed to connect to ${name}:`, error);
            throw error;
        }
    }

    async disconnect(name: string): Promise<void> {
        const client = this.clients.get(name);
        if (client) {
            try {
                await client.close();
            } catch (e) {
                // ignore close errors
            }
            this.clients.delete(name);
            this.connectionErrors.delete(name);
        }
    }

    async reconnect(name: string): Promise<void> {
        await this.disconnect(name);
        const config = await this.configService.loadConfig();
        const serverConfig = config.mcpServers?.[name];
        if (serverConfig) {
            try {
                await this.connectToServer(name, serverConfig);
                this.connectionErrors.delete(name);
            } catch (e) {
                this.connectionErrors.set(name, (e as Error).message);
            }
        }
    }

    async ensureConnections(): Promise<void> {
        const config = await this.configService.loadConfig();
        const servers = config.mcpServers || {};

        for (const [name, serverConfig] of Object.entries(servers)) {
            if (!this.clients.has(name)) {
                try {
                    await this.connectToServer(name, serverConfig);
                    this.connectionErrors.delete(name);
                } catch (e) {
                    this.connectionErrors.set(name, (e as Error).message);
                }
            }
        }
    }

    getStatus(): { connected: string[], errors: Record<string, string>, configured: string[] } {
        return {
            connected: Array.from(this.clients.keys()),
            errors: Object.fromEntries(this.connectionErrors),
            configured: Object.keys(this.configService.getConfig().mcpServers || {})
        };
    }

    private toolErrors: Map<string, string> = new Map();

    async getTools(): Promise<any[]> {
        const allTools: any[] = [];
        this.toolErrors.clear();

        for (const [name, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                if (!result.tools || result.tools.length === 0) {
                    this.toolErrors.set(name, 'Server returned 0 tools');
                }
                const tools = result.tools.map(tool => ({
                    type: 'function',
                    function: {
                        name: tool.name,
                        description: tool.description || `Tool from ${name}`,
                        parameters: tool.inputSchema
                    }
                }));
                allTools.push(...tools);
            } catch (e) {
                this.toolErrors.set(name, (e as Error).message);
            }
        }

        return allTools;
    }

    getToolErrors(): Record<string, string> {
        return Object.fromEntries(this.toolErrors);
    }

    async callTool(name: string, args: any): Promise<string> {
        // Find which client owns this tool
        // Ideally we cache map of tool -> client. For now, inefficient search.
        for (const [clientName, client] of this.clients.entries()) {
            try {
                const tools = await client.listTools(); // Expensive! Should cache tools.
                const exists = tools.tools.find(t => t.name === name);
                if (exists) {
                    const result = await client.callTool({
                        name: name,
                        arguments: args
                    });

                    // Format content
                    return (result as any).content.map((c: any) => {
                        if (c.type === 'text') return c.text;
                        return '[Binary/Image Content]';
                    }).join('\n');
                }
            } catch (e) { }
        }
        throw new Error(`Tool ${name} not found in any connected MCP server.`);
    }

    getClient(name: string): Client | undefined {
        return this.clients.get(name);
    }
}
