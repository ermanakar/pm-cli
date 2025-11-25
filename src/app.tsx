import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { AppProvider } from './context/AppContext.js';
import { Chat } from './commands/Chat.js';
import { ConfigService } from './services/ConfigService.js';
import { LLMService } from './services/LLMService.js';
import { SafetyService } from './services/SafetyService.js';
import { FileSystemService } from './services/FileSystemService.js';

import { InvestigatorService } from './services/InvestigatorService.js';
import { ScribeService } from './services/ScribeService.js';
import { ContextService } from './services/ContextService.js';
import { InvestigatorAgent } from './services/InvestigatorAgent.js';
import { OnboardingService } from './services/OnboardingService.js';

// Initialize services
const safetyService = new SafetyService();
const configService = new ConfigService(process.cwd(), safetyService);

// Load config synchronously-ish (or handle async in provider)
// For CLI, we can await at top level if ESM, but inside React we need to handle it.
// Better: Initialize LLMService empty, then load config in AppProvider.

const llmService = new LLMService();
const fileSystemService = new FileSystemService(safetyService);
const contextService = new ContextService(fileSystemService, configService);
const investigatorService = new InvestigatorService(fileSystemService, llmService, contextService);
const scribeService = new ScribeService(fileSystemService, llmService);
const investigatorAgent = new InvestigatorAgent(llmService, fileSystemService, contextService);
const onboardingService = new OnboardingService(investigatorAgent, contextService, fileSystemService, llmService);

const services = {
    safetyService,
    configService,
    llmService,
    fileSystemService,
    investigatorService,
    scribeService,
    contextService,
    investigatorAgent,
    onboardingService,
};

type View = 'welcome' | 'chat';

const Welcome: React.FC<{ onStart: () => void }> = ({ onStart }) => {
    // Auto-start for now, but could be an interactive menu
    React.useEffect(() => {
        const timer = setTimeout(onStart, 1500);
        return () => clearTimeout(timer);
    }, [onStart]);

    return (
        <Box flexDirection="column" padding={1}>
            <Text color="cyan" bold>PMX</Text>
            <Text>Product Master Plan CLI</Text>
            <Text color="gray">Initializing...</Text>
        </Box>
    );
};

export const App: React.FC = () => {
    const [view, setView] = useState<View>('welcome');

    return (
        <AppProvider services={services}>
            {view === 'welcome' && <Welcome onStart={() => setView('chat')} />}
            {view === 'chat' && <Chat />}
        </AppProvider>
    );
};
