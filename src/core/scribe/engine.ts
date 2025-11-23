import { createDefaultLLMClient, LLMMessage } from '../llm';
import { prepareDocWrite, applyPendingWrite } from '../fsTools';
import { FeatureRequest, ScribeResult, ScribeConfig } from './types';
import { logToolEvent, promptForWriteConfirmation, logContextSummary } from '../../cli/ui';
import { runInvestigation } from '../investigator/engine';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_document',
      description: 'Write the final PRD/Spec to a file.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'The relative path (e.g. docs/features/dark-mode.md)' },
          content: { type: 'string', description: 'The full markdown content' }
        },
        required: ['filename', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'investigate_codebase',
      description: 'Investigate the codebase to gather context for the feature.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'What do you need to know? (e.g. "How is theming handled?")' }
        },
        required: ['question']
      }
    }
  }
];

export async function runFeatureFlow(
  request: FeatureRequest,
  config: ScribeConfig
): Promise<ScribeResult> {
  const llm = createDefaultLLMClient();

  // 1. Grounding Step: Investigate the repo first to establish identity
  // We do this *before* starting the main loop to prevent "I am pmx" hallucinations.
  let repoContext = "No specific repo context found.";
  try {
    repoContext = await getOrComputeRepoIdentity(process.cwd());
    logContextSummary(repoContext);
  } catch (e) {
    console.log("Grounding failed, proceeding with default context.");
  }

  const systemPrompt = `
You are the "Scribe", a specialized Product Manager agent.
Your goal is to take a feature request and produce a high-quality, pragmatic Product Requirements Document (PRD).

FEATURE: "${request.title}"
CONTEXT: "${request.description}"

REPO IDENTITY (CRITICAL):
${repoContext}

INSTRUCTIONS:
1. **Respect Repo Identity**: 
   - If the REPO IDENTITY above indicates this is a user's project (e.g. a Next.js app, a Python script), YOU MUST PLAN FOR THAT PROJECT.
   - Do NOT assume you are building features for the "pmx" CLI unless the identity confirms this IS the pmx repo.
   - If the repo uses NextAuth, plan for NextAuth. If it uses Django, plan for Django.

2. **Context First**:
   - Assume the environment matches the repo's stack (Cloud vs Local).
   - Be ruthless about scope. Do not over-engineer.
   - Distinguish between "v0" (MVP) and "Future".

3. **Structure**: Your PRD must follow this exact structure:
   # [Feature Name]
   
   ## 1. Context & Why Now
   - Why is this valuable *right now*?
   - **Threat/Impact Model**: State clearly what we are protecting/optimizing for.
   - If this is infra-heavy, explicitly call out if it should be deferred.

   ## 2. Success Metrics
   - **Functional**: "Command X runs without error" or "User can log in".
   - **Value/Safety**: "No API key stored in plaintext" or "Audit runs in < 30s".
   - **UX**: "User can complete flow in one attempt".

   ## 3. Scope & Phasing (Ruthless Prioritization)
   - **Phase 0 (MVP)**: The absolute minimum to unblock the user. *Must deliver real value.*
   - **Phase 1**: The robust version.
   - **Future**: The "Cloud" or "Team" version.
   - **Non-Goals**: Explicitly state what we are NOT doing.

   ## 4. User Stories
   - As a [user], I can [action], so that [value].

   ## 5. Solution Overview
   - A short, product-level description of the "how" (1-2 paragraphs).

   ## 6. Technical Implementation Plan
   - **Commands/Routes**: Define the exact commands or API routes.
   - **Modules/Files**: Name the files to change/create.
   - **Integration Points**: How does this fit into the existing architecture?
   - *Avoid low-level pseudocode unless critical.*

   ## 7. Risks & Open Questions

PROCESS:
1. **Investigate**: Use 'investigate_codebase' to check specific patterns if the grounding summary wasn't enough.
2. **Draft**: Synthesize the PRD using the structure above.
3. **Write**: Use 'write_document' to save it to 'docs/features/<slug>.md'.

Be autonomous. Do not ask the user for more input unless absolutely necessary.
`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt }
  ];

  let turns = 0;
  let finalResult: ScribeResult | null = null;

  while (turns < config.maxTurns) {
    turns++;

    // Non-streaming for the sub-agent loop
    const response = await llm.chat(messages, TOOLS);
    const content = response.content || '';
    const toolCalls = response.tool_calls;

    messages.push({
      role: 'assistant',
      content: content,
      tool_calls: toolCalls
    });

    if (!toolCalls || toolCalls.length === 0) {
      if (turns === config.maxTurns - 1) {
        messages.push({ role: 'user', content: "You are running out of turns. Please write the document now." });
      }
      continue;
    }

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let result = '';

      if (fnName === 'write_document') {
        // We pause here to actually perform the write with user confirmation
        // In a real agent loop, we might want to delegate this back to the main REPL,
        // but for now, we'll handle the side-effect here to keep it self-contained.
        try {
          // Run Critic
          logToolEvent({ type: 'shell', target: 'critic', status: 'pending', message: 'Verifying PRD against repo identity...' });
          const criticResult = await runCritic(args.content, repoContext);

          if (!criticResult.valid || criticResult.warnings.length > 0) {
            logToolEvent({ type: 'shell', target: 'critic', status: 'error', message: 'Identity mismatch detected.' });
            console.log(chalk.yellow('\n⚠️  CRITIC WARNINGS:'));
            criticResult.warnings.forEach((w: string) => console.log(chalk.red(`  - ${w}`)));
            console.log(chalk.dim('You can proceed, but the PRD might be hallucinating the wrong project.\n'));
          } else {
            logToolEvent({ type: 'shell', target: 'critic', status: 'ok', message: 'PRD aligns with repo identity.' });
          }

          const pending = await prepareDocWrite(process.cwd(), args.filename, args.content, `Feature Flow: ${request.title}`);

          // We assume the user *wants* this since they asked for the flow, 
          // but we still use the safe confirmation UI.
          const status = await promptForWriteConfirmation(pending);

          if (status === 'approved') {
            await applyPendingWrite(process.cwd(), pending);
            result = `Successfully wrote to ${args.filename}`;
            logToolEvent({ type: 'writeFile', target: args.filename, status: 'ok', message: 'PRD saved.' });

            finalResult = {
              path: args.filename,
              summary: `Created PRD for "${request.title}" at ${args.filename}`
            };

            // We are done!
            return finalResult;

          } else {
            result = 'User rejected the write.';
            if (!criticResult.valid || criticResult.warnings.length > 0) {
              result += `\n\nCRITIC WARNINGS (The user likely rejected it because of these):\n${criticResult.warnings.map(w => `- ${w}`).join('\n')}\n\nPlease fix these issues and try again.`;
            }
            logToolEvent({ type: 'writeFile', target: args.filename, status: 'cancelled', message: 'User rejected.' });
          }
        } catch (err) {
          result = `Error writing file: ${(err as Error).message}`;
        }
      } else if (fnName === 'investigate_codebase') {
        logToolEvent({ type: 'shell', target: 'investigator', status: 'pending', message: `Checking: ${args.question}` });
        try {
          const invResult = await runInvestigation(
            { text: args.question },
            { maxTurns: 5, maxTimeMs: 60 * 1000 } // Shorter budget for sub-tasks
          );
          result = `Investigation Result:\n${invResult.summary}\n\nDetails:\n${invResult.details}`;
          logToolEvent({ type: 'shell', target: 'investigator', status: 'ok', message: 'Investigation complete.' });
        } catch (err) {
          result = `Investigation failed: ${(err as Error).message}`;
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: fnName,
        content: result
      });
    }
  }

  return finalResult || { path: '', summary: 'Failed to generate document within turn limit.' };
}

async function runCritic(prdContent: string, repoContext: string): Promise<{ valid: boolean; warnings: string[] }> {
  const llm = createDefaultLLMClient();
  const response = await llm.chat([
    {
      role: 'system',
      content: `You are a Consistency Critic.
Your job is to compare a generated Product Requirements Document (PRD) against the actual Repository Identity.

REPO IDENTITY:
${repoContext}

PRD CONTENT:
${prdContent.slice(0, 10000)}

TASK:
Check for "Identity Bleed".
- Does the PRD describe a different tech stack? (e.g. PRD says "CLI" but Repo is "Next.js")
- Does the PRD assume features that don't exist?
- Is the scope appropriate?

Return a JSON object: { "valid": boolean, "warnings": string[] }
If valid is false, provide clear warnings.`
    }
  ]);

  try {
    // Strip markdown code blocks if present
    const clean = response.content?.replace(/```json/g, '').replace(/```/g, '').trim() || '{}';
    const result = JSON.parse(clean);
    return {
      valid: result.valid ?? true,
      warnings: result.warnings || []
    };
  } catch (e) {
    return { valid: true, warnings: [] };
  }
}

import { MemoryManager } from '../memory/memory';

async function getOrComputeRepoIdentity(cwd: string): Promise<string> {
  const memoryManager = new MemoryManager(cwd);
  let memory = await memoryManager.load();

  if (memory.identity.name && memory.identity.stack) {
    logToolEvent({ type: 'shell', target: 'memory', status: 'ok', message: 'Loaded repo identity from memory.' });
    return `Project: ${memory.identity.name}\nStack: ${memory.identity.stack}\nVision: ${memory.identity.vision}`;
  }

  logToolEvent({ type: 'shell', target: 'investigator', status: 'pending', message: 'Grounding: Analyzing repo identity...' });

  // We run an investigation and explicitly ask it to update memory
  await runInvestigation(
    { text: "Identify the product name, tech stack, and key architecture patterns. Use the 'update_memory' tool to save this identity." },
    { maxTurns: 5, maxTimeMs: 30 * 1000 }
  );

  // Reload memory to see if it was updated
  memory = await memoryManager.load();

  if (memory.identity.name) {
    logToolEvent({ type: 'shell', target: 'investigator', status: 'ok', message: 'Repo identity established and saved.' });
    return `Project: ${memory.identity.name}\nStack: ${memory.identity.stack}\nVision: ${memory.identity.vision}`;
  }

  return "Identity could not be established automatically.";
}
