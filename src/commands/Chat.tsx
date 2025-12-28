import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { useServices } from '../context/AppContext.js';
import { ChatMessage } from '../services/LLMService.js';

export const Chat: React.FC = () => {
    const {
        llmService,
        investigatorService,
        scribeService,
        contextService,
        investigatorAgent,
        onboardingService,
        configService,
        mcpService,
        memoryService,
        intentService,
        healthService
    } = useServices();
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
                    // Parse flags from args
                    const flags = args.filter(a => a.startsWith('--'));
                    const nonFlagArgs = args.filter(a => !a.startsWith('--'));
                    const type = nonFlagArgs[0];
                    const topic = nonFlagArgs.slice(1).join(' ');

                    const wantSync = flags.includes('--sync');
                    const wantJira = flags.includes('--jira') || wantSync;
                    const wantConfluence = flags.includes('--confluence') || wantSync;

                    if (!type || !topic) {
                        systemResponse = `Usage: /scribe <type> <topic> [--sync] [--jira] [--confluence]

📝 Document Types:
  • prd    - Product Requirements Document
  • ticket - Engineering Ticket
  • spec   - Technical Specification

🔌 Sync Options:
  • --sync       - Push to Confluence AND create Jira tickets
  • --jira       - Create Jira tickets from acceptance criteria
  • --confluence - Push document to Confluence

Examples:
  /scribe prd User Authentication
  /scribe prd Dark Mode --sync
  /scribe ticket Fix Login Bug --jira`;
                    } else {
                        // Show step-by-step progress
                        let progressLog: string[] = [];
                        const updateProgress = (step: string) => {
                            progressLog.push(step);
                            setStreamingContent(
                                `📝 Generating ${type.toUpperCase()}: ${topic}\n\n` +
                                progressLog.join('\n')
                            );
                        };

                        updateProgress('🚀 Starting Smart Scribe...');

                        const result = await scribeService.generateArtifact(
                            type,
                            topic,
                            undefined, // No additional context
                            { investigate: true, includeMemory: true },
                            updateProgress
                        );

                        // Build completion summary
                        let syncResults = '';

                        // Handle Jira sync with confirmation
                        if (wantJira) {
                            const acCount = scribeService.getAcceptanceCriteriaCount(result.content);
                            if (acCount > 0) {
                                updateProgress(`\n🎫 Found ${acCount} acceptance criteria for Jira tickets:`);
                                const previews = scribeService.getAcceptanceCriteriaPreviews(result.content);
                                previews.forEach((p, i) => updateProgress(`   ${i + 1}. ${p}`));
                                updateProgress(`\n📤 Creating ${acCount} Jira tickets in project SCRUM...`);

                                const jiraResult = await scribeService.createJiraTicketsFromACs(
                                    topic,
                                    result.content,
                                    'SCRUM', // TODO: Get from config
                                    'Task'
                                );

                                if (jiraResult.success) {
                                    syncResults += `\n🎫 Jira Tickets Created:\n`;
                                    jiraResult.tickets.forEach(t => {
                                        syncResults += `   ✓ ${t}\n`;
                                    });
                                } else {
                                    syncResults += `\n❌ Jira sync failed: ${jiraResult.error}\n`;
                                }
                            } else {
                                syncResults += `\n⚠️ No acceptance criteria found - skipping Jira tickets\n`;
                            }
                        }

                        // Handle Confluence sync
                        if (wantConfluence) {
                            updateProgress('\n☁️ Syncing to Confluence...');
                            const confluenceResult = await scribeService.syncToConfluence(
                                topic,
                                result.content,
                                'SCRUM' // TODO: Get from config - space key
                            );

                            if (confluenceResult.success) {
                                syncResults += `\n☁️ Confluence: ${confluenceResult.pageUrl || 'Page created'}\n`;
                            } else {
                                syncResults += `\n❌ Confluence sync failed: ${confluenceResult.error}\n`;
                            }
                        }

                        // Show completion summary with document preview option
                        const docPreview = result.content.length > 500
                            ? result.content.slice(0, 500) + '\n\n... (truncated)'
                            : result.content;

                        systemResponse = `
╔══════════════════════════════════════════════════════════════╗
║  ✅ DOCUMENT GENERATED                                       ║
╠══════════════════════════════════════════════════════════════╣
║  📄 File: ${result.filename.padEnd(47)}║
║  📝 Type: ${result.type.toUpperCase().padEnd(47)}║
║  📋 Topic: ${result.topic.slice(0, 45).padEnd(46)}║
╚══════════════════════════════════════════════════════════════╝
${syncResults}
📖 Preview:
─────────────────────────────────────────────────────────────────
${docPreview}
─────────────────────────────────────────────────────────────────

💡 To view the full document: /read ${result.filename}`;
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
                } else if (command === '/memory') {
                    // Memory commands
                    const subCmd = args[0];
                    if (!subCmd || subCmd === 'view') {
                        setStreamingContent('Loading strategic memory...');
                        const summary = await memoryService.getSummary();
                        const context = await memoryService.getContextForAgent();

                        systemResponse = `🧠 PMX Strategic Memory

📊 Summary:
  • Identity: ${summary.hasIdentity ? '✅ Set' : '❌ Not set (run /init)'}
  • OKRs: ${summary.okrCount}
  • Decisions: ${summary.decisionCount}
  • Open Risks: ${summary.openRiskCount}
  • Personas: ${summary.personaCount}
  • Insights: ${summary.insightCount}

📋 Current Context:
${context}

💡 Commands:
  /memory okr <objective>     - Add a new OKR
  /memory decision <title>    - Log a decision
  /memory risk <title>        - Add a risk
  /memory persona <name>      - Add a persona
`;
                    } else if (subCmd === 'okr') {
                        const objective = args.slice(1).join(' ');
                        if (!objective) {
                            systemResponse = 'Usage: /memory okr <objective>';
                        } else {
                            const okr = await memoryService.addOKR(objective);
                            systemResponse = `✅ OKR Added!

Objective: ${okr.objective}
Quarter: ${okr.quarter}
Status: ${okr.status}

💡 To add Key Results, use:
/memory kr ${okr.id.slice(0, 8)} <description> <target> <unit>
`;
                        }
                    } else if (subCmd === 'decision') {
                        const title = args.slice(1).join(' ');
                        if (!title) {
                            systemResponse = 'Usage: /memory decision <title>';
                        } else {
                            const decision = await memoryService.logDecision({
                                title,
                                context: 'Logged via CLI',
                                decision: title,
                                rationale: 'To be documented',
                                alternatives: [],
                                tags: []
                            });
                            systemResponse = `✅ Decision Logged!

Title: ${decision.title}
Date: ${new Date(decision.date).toLocaleDateString()}

💡 You can update this decision with more context using the memory file at .pmx/memory.json
`;
                        }
                    } else if (subCmd === 'risk') {
                        const title = args.slice(1).join(' ');
                        if (!title) {
                            systemResponse = 'Usage: /memory risk <title>';
                        } else {
                            const risk = await memoryService.addRisk({
                                title,
                                description: 'To be documented',
                                likelihood: 'medium',
                                impact: 'medium',
                                mitigation: 'To be determined',
                                status: 'open'
                            });
                            systemResponse = `⚠️ Risk Registered!

Title: ${risk.title}
Likelihood: ${risk.likelihood}
Impact: ${risk.impact}
Status: ${risk.status}

💡 Update risk details in .pmx/memory.json
`;
                        }
                    } else if (subCmd === 'persona') {
                        const name = args.slice(1).join(' ');
                        if (!name) {
                            systemResponse = 'Usage: /memory persona <name>';
                        } else {
                            const persona = await memoryService.addPersona({
                                name,
                                role: 'To be defined',
                                goals: [],
                                painPoints: [],
                                behaviors: []
                            });
                            systemResponse = `👤 Persona Added!

Name: ${persona.name}

💡 Update persona details in .pmx/memory.json
`;
                        }
                    } else {
                        systemResponse = `Unknown memory command: ${subCmd}

Usage:
  /memory              - View strategic memory
  /memory okr <text>   - Add an OKR
  /memory decision <text> - Log a decision
  /memory risk <text>  - Add a risk
  /memory persona <name> - Add a persona
`;
                    }
                } else if (command === '/health') {
                    // Health check commands
                    const subCmd = args[0];
                    if (subCmd === 'quick') {
                        setStreamingContent('Running quick health check...');
                        const stats = await healthService.getQuickStats();
                        systemResponse = healthService.formatQuickStats(stats);
                    } else {
                        setStreamingContent('Running full health check... This may take a moment.');
                        const report = await healthService.runHealthCheck();
                        systemResponse = healthService.formatReport(report);
                    }
                } else if (command === '/help') {
                    systemResponse = intentService.getHelpText();
                } else {
                    systemResponse = `Unknown command: ${command}

Type /help to see available commands.`;
                }

                setHistory([...newHistory, { role: 'assistant', content: systemResponse }]);
                setStreamingContent('');
                setIsLoading(false);
                return;
            }

            // Natural Language Intent Detection
            setStreamingContent('Understanding your request...');
            const intent = await intentService.classifyIntent(value);

            switch (intent.type) {
                case 'investigate':
                    setStreamingContent('Investigating...');
                    const investigateResult = await investigatorAgent.investigate(
                        intent.query,
                        (status) => setStreamingContent(status),
                        async (tool, args) => {
                            return new Promise<boolean>((resolve) => {
                                setConfirmation({ tool, args, resolve });
                            });
                        }
                    );
                    setHistory([...newHistory, { role: 'assistant', content: investigateResult }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'plan':
                    // Use investigator to plan a feature
                    setStreamingContent(`Planning feature: ${intent.feature}...`);
                    const planResult = await investigatorAgent.investigate(
                        `Create a detailed Product Requirements Document (PRD) for: ${intent.feature}. 
                        First investigate the existing codebase to understand current architecture, 
                        then draft a plan that fits with the existing patterns.`,
                        (status) => setStreamingContent(status)
                    );
                    setHistory([...newHistory, { role: 'assistant', content: planResult }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'read':
                    const readResult = await investigatorService.readFileContext(intent.path);
                    setHistory([...newHistory, { role: 'assistant', content: readResult }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'init':
                    setStreamingContent('Initializing Deep Scan...');
                    const initSummary = await onboardingService.runDeepScan((status) => setStreamingContent(status));
                    setHistory([...newHistory, { role: 'assistant', content: `Deep Scan complete.\n\n${initSummary}` }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'memory':
                    const memSummary = await memoryService.getSummary();
                    const memContext = await memoryService.getContextForAgent();
                    const memResponse = `🧠 Strategic Memory\n\n${memContext}\n\n(${memSummary.okrCount} OKRs, ${memSummary.decisionCount} decisions, ${memSummary.openRiskCount} open risks)`;
                    setHistory([...newHistory, { role: 'assistant', content: memResponse }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'health':
                    setStreamingContent('Running health check...');
                    if (intent.quick) {
                        const quickStats = await healthService.getQuickStats();
                        const response = healthService.formatQuickStats(quickStats);
                        setHistory([...newHistory, { role: 'assistant', content: response }]);
                    } else {
                        const fullReport = await healthService.runHealthCheck();
                        const response = healthService.formatReport(fullReport);
                        setHistory([...newHistory, { role: 'assistant', content: response }]);
                    }
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'help':
                    setHistory([...newHistory, { role: 'assistant', content: intentService.getHelpText() }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'quit':
                    exit();
                    return;

                case 'jira':
                    // Route to investigator with Jira context
                    setStreamingContent('Working with Jira...');
                    const jiraResult = await investigatorAgent.investigate(
                        intent.data || 'Show available Jira projects',
                        (status) => setStreamingContent(status)
                    );
                    setHistory([...newHistory, { role: 'assistant', content: jiraResult }]);
                    setStreamingContent('');
                    setIsLoading(false);
                    return;

                case 'chat':
                default:
                    // Regular chat - inject strategic context
                    const memoryContext = await memoryService.getContextForAgent();
                    const enrichedHistory = [
                        {
                            role: 'system' as const,
                            content: `You are PMX, an AI Product Manager assistant. You have access to the project's strategic context:

${memoryContext}

Be helpful, concise, and product-focused. If the user seems to be asking about the codebase, suggest using specific investigation commands.`
                        },
                        ...newHistory
                    ];

                    let fullResponse = '';
                    await llmService.streamChatCompletion(enrichedHistory, (chunk: string) => {
                        fullResponse += chunk;
                        setStreamingContent(fullResponse);
                    });

                    setHistory([...newHistory, { role: 'assistant', content: fullResponse }]);
                    setStreamingContent('');
                    break;
            }
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
                <Text bold underline>Commands (or just ask naturally!):</Text>
                <Box flexDirection="column" marginLeft={2}>
                    <Text><Text color="green" bold>/init</Text>        - Deep Scan & Initialize Project Context</Text>
                    <Text><Text color="green" bold>/investigate</Text> - Agentic Codebase Exploration</Text>
                    <Text><Text color="yellow" bold>/scribe</Text>      - Smart Docs: Generate PRDs, Tickets, Specs</Text>
                    <Text><Text color="cyan" bold>/memory</Text>      - Strategic Memory (OKRs, Decisions, Risks)</Text>
                    <Text><Text color="cyan" bold>/health</Text>      - Codebase Health Check</Text>
                    <Text><Text color="gray" bold>/jira</Text>        - Jira Integration</Text>
                    <Text><Text color="gray" bold>/help</Text>        - Show all commands</Text>
                </Box>
            </Box>

            <Box marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
                <Text color="green">💡 Just type naturally! "How does auth work?" or "Create a PRD for dark mode"</Text>
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
