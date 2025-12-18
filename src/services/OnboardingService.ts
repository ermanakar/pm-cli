import chalk from 'chalk';
import { InvestigatorAgent } from './InvestigatorAgent.js';
import { ContextService } from './ContextService.js';
import { FileSystemService } from './FileSystemService.js';
import { LLMService } from './LLMService.js';

export class OnboardingService {
    constructor(
        private investigator: InvestigatorAgent,
        private contextService: ContextService,
        private fileSystem: FileSystemService,
        private llm: LLMService
    ) { }

    async runDeepScan(onUpdate?: (status: string) => void): Promise<string> {
        onUpdate?.('Starting Deep Scan (Phase 1/2): Analyzing Codebase...');

        // Phase 1: Deep Scan (Agent)
        const investigationObjective = `
      Analyze this project to understand its core purpose, technology stack, and business domain.
      
      1. READ 'package.json' (Node) OR 'Podfile'/'Package.swift' (iOS) for dependencies.
      2. SCAN for database schemas (prisma, mongoose, CoreData, SwiftData).
      3. CHECK routes/controllers (Web) OR Views/ViewModels (iOS/SwiftUI) to infer key features.
      4. LOOK for 'Info.plist' or 'App.tsx' entry points.
      5. IDENTIFY the business domain (e.g. "E-commerce", "DevTool", "Healthcare").
      
      GOAL: Extract the "Soul" of the product. What is it? Who is it for? How is it built?
      
      Report your findings in a detailed summary.
    `;

        const investigationSummary = await this.investigator.investigate(investigationObjective, onUpdate);

        onUpdate?.('Phase 2/2: Distilling Product Identity...');

        // Phase 2: Draft Identity (LLM)
        const profilePrompt = `
        You are a Product Visionary.
        Based on the investigation below, define the product identity.
        
        INVESTIGATION:
        ${investigationSummary}
        
        Return a JSON object with:
        - "name": The project name (infer from package.json or folder name).
        - "oneLiner": A punchy, 1-sentence description of what this product IS.
        - "targetAudience": Who is this for?
        - "stack": A concise summary of the tech stack (e.g. "Next.js, Prisma, Postgres").
        - "features": An array of 3-5 core features found in the code.
        - "domain": The business domain (e.g. "SaaS", "E-commerce").
        - "context": A paragraph summarizing the project context (what it is, how it works, key entities).
    `;

        const response = await this.llm.chatCompletion([{ role: 'user', content: profilePrompt }]);
        const jsonMatch = response?.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            try {
                const data = JSON.parse(jsonMatch[0]);

                await this.contextService.initializeContext({
                    name: data.name,
                    description: data.oneLiner,
                    architecture: data.stack,
                    domain: data.domain,
                    context: data.context
                });

                // Create PMX.md
                const pmxContent = `# ${data.name}

## Vision
${data.oneLiner}

## Target Audience
${data.targetAudience}

## Tech Stack
${data.stack}

## Core Features
${(data.features || []).map((f: string) => `- ${f}`).join('\n')}

## Domain
${data.domain}

## Context
${data.context}
`;
                await this.fileSystem.writeFile('PMX.md', pmxContent);
                onUpdate?.('Deep Scan complete. PMX.md created.');

                // Return a distilled "Senior Product Strategist" summary for the UI
                const strategistSummary = [
                    '',
                    chalk.hex('#FFD700').bold('🎯 STRATEGIC BRIEF'),
                    chalk.gray('────────────────────────────────────────────────────────────'),
                    '',
                    chalk.bold.cyan('VISION'),
                    ` ${data.oneLiner}`,
                    '',
                    chalk.bold.cyan('MARKET'),
                    ` ${chalk.gray('Domain:')}   ${data.domain}`,
                    ` ${chalk.gray('Audience:')} ${data.targetAudience}`,
                    '',
                    chalk.bold.cyan('CAPABILITIES'),
                    (data.features || []).map((f: string) => ` ${chalk.green('•')} ${f}`).join('\n'),
                    '',
                    chalk.gray('────────────────────────────────────────────────────────────'),
                    chalk.dim.italic(' Full context saved to PMX.md'),
                    ''
                ].join('\n');

                return strategistSummary;
            } catch (e) {
                onUpdate?.('Failed to parse Product Identity.');
                return "Deep Scan completed, but failed to parse structured identity.";
            }
        } else {
            onUpdate?.('Failed to generate structured Product Identity.');
            return "Deep Scan completed, but failed to generate structured identity.";
        }
    }
}
