import { createDefaultLLMClient, LLMMessage } from '../llm';
import { prepareDocWrite, applyPendingWrite } from '../fsTools';
import { FeatureRequest, ScribeResult, ScribeConfig } from './types';
import { logToolEvent, promptForWriteConfirmation } from '../../cli/ui';
import { runInvestigation } from '../investigator/engine';

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
  
  const systemPrompt = `
You are the "Scribe", a specialized Product Manager agent for pmx.
Your goal is to take a feature request and produce a high-quality, pragmatic Product Requirements Document (PRD).

FEATURE: "${request.title}"
CONTEXT: "${request.description}"

CRITICAL INSTRUCTIONS:
1. **Context First**: You are building for a local CLI tool (pmx) that currently has NO hosted backend.
   - Assume a single-user environment unless specified otherwise.
   - Be ruthless about scope. Do not over-engineer.
   - Distinguish between "v0" (Local/MVP) and "Future" (Cloud/SaaS).

2. **Structure**: Your PRD must follow this exact structure:
   # [Feature Name]
   
   ## 1. Context & Why Now
   - Why is this valuable *right now*?
   - Does this align with the current "Local CLI" stage of pmx?
   - If this is infra-heavy (e.g. full auth), explicitly call out if it should be deferred.

   ## 2. Success Metrics
   - How do we know this is working? (e.g. "User can run command X without error")

   ## 3. Scope & Phasing (Ruthless Prioritization)
   - **Phase 0 (MVP)**: The absolute minimum to unblock the user. (e.g. "Local config file")
   - **Phase 1**: The robust local version.
   - **Future**: The "Cloud" or "Team" version.

   ## 4. User Stories
   - As a [user], I can [action], so that [value].

   ## 5. Technical Implementation Plan
   - High-level approach.
   - Key components to change.
   - *Keep it grounded in the current codebase.*

   ## 6. Risks & Open Questions

PROCESS:
1. **Investigate**: Use 'investigate_codebase' to check existing patterns. Don't guess.
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
