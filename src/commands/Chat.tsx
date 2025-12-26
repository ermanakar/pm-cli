import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { useServices } from '../context/AppContext.js';
import { ChatMessage } from '../services/LLMService.js';

export const Chat: React.FC = () => {
    const { llmService, investigatorService, scribeService, contextService, investigatorAgent, onboardingService, configService, mcpService } = useServices();
    const { exit } = useApp();
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');

    const [apiKeyInput, setApiKeyInput] = useState('');
    const [needsApiKey, setNeedsApiKey] = useState(!llmService.isReady());

    const [confirmation, setConfirmation] = useState<{
        tool: string;
        args: any;
        resolve: (value: boolean) => void;
    } | null>(null);

    useEffect(() => {
        const checkKey = async () => {
            if (!llmService.isReady()) {
                await configService.loadConfig();
                const globalConfig = configService.getGlobalConfig();
                if (globalConfig.openaiApiKey) {
                    llmService.setApiKey(globalConfig.openaiApiKey);
                    setNeedsApiKey(false);
                } else {
                    setNeedsApiKey(true);
                }
            }
        };
        checkKey();
    }, []);

    const handleApiKeySubmit = async (key: string) => {
        if (!key.trim()) return;

        // Save to global config
        await configService.saveGlobalConfig({ openaiApiKey: key });
        llmService.setApiKey(key);
        setNeedsApiKey(false);
        setStreamingContent('API Key saved! You can now use PMX.');
        setTimeout(() => setStreamingContent(''), 2000);
    };

    const handleConfirmation = (approved: boolean) => {
        if (confirmation) {
            confirmation.resolve(approved);
            setConfirmation(null);
        }
    };

    if (needsApiKey) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text color="yellow">⚠️  OpenAI API Key not found.</Text>
                <Text>Please enter your API key to continue (saved to ~/.pmx-global/config.json):</Text>
                <Box marginTop={1}>
                    <Text color="green">➜ </Text>
                    <TextInput
                        value={apiKeyInput}
                        onChange={setApiKeyInput}
                        onSubmit={handleApiKeySubmit}
                        mask="*"
                    />
                </Box>
            </Box>
        );
    }

    if (confirmation) {
        const items = [
            { label: '✅ Allow', value: 'yes' },
            { label: '❌ Deny', value: 'no' }
        ];

        return (
            <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
                <Text color="yellow" bold>⚠️  Approval Required</Text>
                <Text>The agent wants to execute:</Text>
                <Text color="cyan" bold>{confirmation.tool}</Text>
                <Text color="dim">{JSON.stringify(confirmation.args, null, 2)}</Text>
                <Box marginTop={1}>
                    <SelectInput
                        items={items}
                        onSelect={(item) => handleConfirmation(item.value === 'yes')}
                    />
                </Box>
            </Box>
        );
    }

    const handleSubmit = async (value: string) => {
        if (!value.trim()) return;

        const userMsg: ChatMessage = { role: 'user', content: value };
        const newHistory = [...history, userMsg];

        setHistory(newHistory);
        setInput('');
        setIsLoading(true);
        setStreamingContent('');

        try {
            // Handle Slash Commands
            if (value.startsWith('/')) {
                const [command, ...args] = value.split(' ');
                let systemResponse = '';

                if (command === '/init') {
                    setStreamingContent('Initializing Deep Scan...');
                    const summary = await onboardingService.runDeepScan((status) => setStreamingContent(status));
                    systemResponse = `Deep Scan complete. Project context initialized.\n\n${summary}`;
                } else if (command === '/investigate') {
                    const input = args.join(' ') || process.cwd();
                    setStreamingContent('Investigating...');
                    systemResponse = await investigatorAgent.investigate(
                        input,
                        (status) => setStreamingContent(status),
                        async (tool, args) => {
                            return new Promise<boolean>((resolve) => {
                                setConfirmation({ tool, args, resolve });
                            });
                        }
                    );
                } else if (command === '/read') {
                    const path = args[0];
                    if (!path) {
                        systemResponse = 'Usage: /read <path>';
                    } else {
                        systemResponse = await investigatorService.readFileContext(path);
                    }
                } else if (command === '/scribe') {
                    const type = args[0];
                    const topic = args.slice(1).join(' ');
                    if (!type || !topic) {
                        systemResponse = 'Usage: /scribe <type> <topic>';
                    } else {
                        setStreamingContent('Generating artifact...');
                        const filename = await scribeService.generateArtifact(type, topic, 'Context from chat history...'); // TODO: Pass better context
                        systemResponse = `Generated artifact: ${filename}`;
                    }
                } else if (command === '/mcp') {
                    const subCmd = args[0];
                    if (subCmd === 'status') {
                        setStreamingContent('Checking MCP status...');
                        const status = mcpService.getStatus();
                        const tools = await mcpService.getTools();

                        let errorSection = '';
                        if (Object.keys(status.errors).length > 0) {
                            errorSection = `\n❌ Connection Errors:\n${Object.entries(status.errors).map(([name, err]) => `- ${name}: ${err}`).join('\n')}\n`;
                        }

                        systemResponse = `🔌 MCP Status:
Configured Servers: ${status.configured.join(', ') || 'None'}
Connected Servers: ${status.connected.join(', ') || 'None'}
${errorSection}
Tools Available: ${tools.length}
${tools.length > 0 ? tools.map((t: any) => `- ${t.function.name}`).join('\n') : '(No tools loaded)'}
`;
                    } else if (subCmd === 'connect') {
                        setStreamingContent('Connecting to MCP servers...');
                        await mcpService.ensureConnections();
                        const status = mcpService.getStatus();
                        systemResponse = `Connection attempt complete.\nConnected: ${status.connected.join(', ') || 'None'}\nErrors: ${Object.keys(status.errors).length > 0 ? JSON.stringify(status.errors) : 'None'}`;
                    } else {
                        systemResponse = `Usage: /mcp status   - Check connection status
       /mcp connect  - Retry connections`;
                    }
                } else if (command === '/jira') {
                    const subCmd = args[0];
                    if (subCmd === 'setup') {
                        // Interactive setup - we'll collect info step by step
                        // For now, provide instructions since multi-step input in Ink is complex
                        systemResponse = `🔧 Jira Setup

To configure Jira integration, I need 3 pieces of information:
1. Your Atlassian email
2. Your API token (get one at https://id.atlassian.com/manage-profile/security/api-tokens)
3. Your Jira instance URL (e.g., https://yourcompany.atlassian.net)

Run the following command with your details:
/jira configure <email> <api_token> <instance_url>

Example:
/jira configure john@company.com ATATT3x... https://mycompany.atlassian.net
`;
                    } else if (subCmd === 'configure') {
                        const email = args[1];
                        const token = args[2];
                        const instanceUrl = args[3];

                        if (!email || !token || !instanceUrl) {
                            systemResponse = 'Usage: /jira configure <email> <api_token> <instance_url>';
                        } else {
                            setStreamingContent('Saving Jira configuration...');
                            try {
                                // Save to project config
                                const currentConfig = configService.getConfig();
                                await configService.saveConfig({
                                    ...currentConfig,
                                    mcpServers: {
                                        ...(currentConfig.mcpServers || {}),
                                        jira: {
                                            command: 'docker',
                                            args: [
                                                'run', '-i', '--rm',
                                                '-e', `JIRA_URL=${instanceUrl}`,
                                                '-e', `JIRA_USERNAME=${email}`,
                                                '-e', `JIRA_API_TOKEN=${token}`,
                                                'ghcr.io/sooperset/mcp-atlassian:latest'
                                            ]
                                        }
                                    }
                                });

                                // Force reconnect (disconnect old, connect new)
                                setStreamingContent('Connecting to Jira MCP server...');
                                await mcpService.reconnect('jira');

                                const tools = await mcpService.getTools();
                                const jiraTools = tools.filter((t: any) => t.function.name.startsWith('jira_'));

                                systemResponse = `✅ Jira configured successfully!

Saved to: .pmx/config.json
Connected Tools: ${jiraTools.length} Jira tools available

You can now ask me things like:
- "Show me open bugs in project X"
- "Create a ticket for the login bug"
- "What are my assigned issues?"
`;
                            } catch (error) {
                                systemResponse = `❌ Failed to configure Jira: ${error}`;
                            }
                        }
                    } else {
                        systemResponse = `Usage: /jira setup   - Start Jira configuration wizard
       /jira configure <email> <token> <url>   - Configure Jira directly`;
                    }
                } else {
                    systemResponse = `Unknown command: ${command}`;
                }

                setHistory([...newHistory, { role: 'assistant', content: systemResponse }]);
                setStreamingContent('');
                setIsLoading(false);
                return;
            }

            // Normal Chat
            let fullResponse = '';
            await llmService.streamChatCompletion(newHistory, (chunk: string) => {
                fullResponse += chunk;
                setStreamingContent(fullResponse);
            });

            setHistory([...newHistory, { role: 'assistant', content: fullResponse }]);
            setStreamingContent('');
        } catch (error) {
            setHistory([...newHistory, { role: 'assistant', content: `Error: ${error}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    const WelcomeScreen = () => (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
            <Text color="cyan" bold>
                {`
  ██████╗ ███╗   ███╗██╗  ██╗
  ██╔══██╗████╗ ████║╚██╗██╔╝
  ██████╔╝██╔████╔██║ ╚███╔╝ 
  ██╔═══╝ ██║╚██╔╝██║ ██╔██╗ 
  ██║     ██║ ╚═╝ ██║██╔╝ ██╗
  ╚═╝     ╚═╝     ╚═╝╚═╝  ╚═╝
`}
            </Text>
            <Text bold>Product Management Extended (PMX) CLI</Text>
            <Text color="gray">Your AI-powered Product Engineering Partner</Text>

            <Box flexDirection="column" marginTop={1}>
                <Text bold underline>Available Commands:</Text>
                <Box marginLeft={2}>
                    <Text><Text color="green" bold>/init</Text>        - Deep Scan & Initialize Project Context</Text>
                    <Text><Text color="green" bold>/investigate</Text> - Agentic Codebase Exploration</Text>
                    <Text><Text color="green" bold>/jira</Text>        - Setup Jira Integration</Text>
                    <Text><Text color="green" bold>/read</Text>        - Read specific file context</Text>
                    <Text><Text color="green" bold>/scribe</Text>      - Generate documentation artifacts</Text>
                </Box>
            </Box>

            <Box marginTop={1} borderStyle="single" borderColor="yellow" paddingX={1}>
                <Text color="yellow">⚠️  TIP: Run <Text bold>/init</Text> first to generate your PMX.md profile!</Text>
            </Box>
        </Box>
    );

    return (
        <Box flexDirection="column" padding={1}>
            {history.length === 0 && !isLoading && <WelcomeScreen />}

            {history.map((msg, index) => (
                <Box key={index} flexDirection="column" marginBottom={1}>
                    <Text color={msg.role === 'user' ? 'blue' : 'green'} bold>
                        {msg.role === 'user' ? 'You' : 'PMX'}:
                    </Text>
                    <Box marginLeft={2}>
                        <Text>{msg.content}</Text>
                    </Box>
                </Box>
            ))}

            {isLoading && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="green" bold>PMX:</Text>
                    <Box marginLeft={2}>
                        {streamingContent ? (
                            <Text>{streamingContent}</Text>
                        ) : (
                            <Text><Spinner type="dots" /> Thinking...</Text>
                        )}
                    </Box>
                </Box>
            )}

            <Box borderStyle="round" borderColor="blue" paddingX={1}>
                <Text color="blue">❯ </Text>
                <TextInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSubmit}
                    placeholder="Ask PMX anything..."
                />
            </Box>

            <Box marginTop={1}>
                <Text color="gray" dimColor>Press Ctrl+C to exit</Text>
            </Box>
        </Box>
    );
};
