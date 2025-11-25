import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { useServices } from '../context/AppContext.js';
import { ChatMessage } from '../services/LLMService.js';

export const Chat: React.FC = () => {
    const { llmService, investigatorService, scribeService, contextService, investigatorAgent, onboardingService, configService } = useServices();
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
                    await onboardingService.runDeepScan((status) => setStreamingContent(status));
                    systemResponse = 'Deep Scan complete. Project context initialized.';
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

    return (
        <Box flexDirection="column" padding={1}>
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
