import React, { createContext, useContext } from 'react';
import { ConfigService } from '../services/ConfigService.js';
import { LLMService } from '../services/LLMService.js';
import { SafetyService } from '../services/SafetyService.js';
import { FileSystemService } from '../services/FileSystemService.js';
import { InvestigatorService } from '../services/InvestigatorService.js';
import { ScribeService } from '../services/ScribeService.js';
import { ContextService } from '../services/ContextService.js';
import { InvestigatorAgent } from '../services/InvestigatorAgent.js';
import { OnboardingService } from '../services/OnboardingService.js';

interface AppContextType {
    configService: ConfigService;
    llmService: LLMService;
    safetyService: SafetyService;
    fileSystemService: FileSystemService;
    investigatorService: InvestigatorService;
    scribeService: ScribeService;
    contextService: ContextService;
    investigatorAgent: InvestigatorAgent;
    onboardingService: OnboardingService;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{
    children: React.ReactNode;
    services: AppContextType;
}> = ({ children, services }) => {
    return <AppContext.Provider value={services}>{children}</AppContext.Provider>;
};

export const useServices = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useServices must be used within an AppProvider');
    }
    return context;
};
