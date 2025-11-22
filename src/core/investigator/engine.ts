import { createDefaultLLMClient, LLMMessage } from '../llm';
import { listDocFiles, readDocFile, searchFiles } from '../fsTools';
import { InvestigationConfig, InvestigationObjective, InvestigationResult, EvidenceItem } from './types';
import { logToolEvent } from '../../cli/ui';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The relative path to the file' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path (default: docs/)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a string pattern across allowed files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The regex or string to search for' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_report',
      description: 'Submit the final investigation report and end the session.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Executive summary of findings' },
          details: { type: 'string', description: 'Detailed markdown report' },
          evidence: { 
            type: 'array', 
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                summary: { type: 'string' },
                snippet: { type: 'string' }
              }
            },
            description: 'List of evidence items collected'
          }
        },
        required: ['summary', 'details', 'evidence']
      }
    }
  }
];

export async function runInvestigation(
  objective: InvestigationObjective,
  config: InvestigationConfig
): Promise<InvestigationResult> {
  const llm = createDefaultLLMClient();
  const startTime = Date.now();
  
  const systemPrompt = `
You are a Codebase Investigator for pmx.
Your goal is to answer the user's objective by exploring the codebase.

OBJECTIVE: "${objective.text}"

GUIDELINES:
1. Use 'list_files' to explore structure.
2. Use 'search_files' to find keywords.
3. Use 'read_file' to examine relevant code.
4. Accumulate evidence.
5. When you have enough information, call 'submit_report'.
6. Do not hallucinate files. Only use what you see.
7. Be efficient. You have a limited number of turns.

You cannot modify files. You are read-only.
`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt }
  ];

  let turns = 0;

  while (turns < config.maxTurns) {
    if (Date.now() - startTime > config.maxTimeMs) {
      break; // Time limit exceeded
    }

    turns++;
    
    // We don't stream here, we just wait for the decision
    const response = await llm.chat(messages, TOOLS);
    const content = response.content || '';
    const toolCalls = response.tool_calls;

    messages.push({
      role: 'assistant',
      content: content,
      tool_calls: toolCalls
    });

    if (!toolCalls || toolCalls.length === 0) {
      // If the model just talks without calling tools, we nudge it or just continue.
      // But if it thinks it's done without submitting, we should remind it.
      if (turns === config.maxTurns - 1) {
         messages.push({ role: 'user', content: "You are out of turns. Please call submit_report now with what you have." });
         continue;
      }
      // Otherwise, just let it continue (maybe it's thinking aloud)
      continue;
    }

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      let result = '';

      if (fnName === 'submit_report') {
        return {
          objective,
          summary: args.summary,
          details: args.details,
          evidence: args.evidence || []
        };
      }

      try {
        if (fnName === 'read_file') {
          const doc = await readDocFile(process.cwd(), args.path);
          result = doc.content;
          logToolEvent({ type: 'readFile', target: args.path, status: 'ok', preview: doc.preview });
        } else if (fnName === 'list_files') {
          const files = await listDocFiles(process.cwd(), args.path || 'docs/');
          result = files.join('\n');
          logToolEvent({ type: 'readFolder', target: args.path || 'docs/', status: 'ok', message: `Found ${files.length} files` });
        } else if (fnName === 'search_files') {
          const matches = await searchFiles(process.cwd(), args.pattern);
          result = JSON.stringify(matches, null, 2);
          logToolEvent({ type: 'shell', target: `grep "${args.pattern}"`, status: 'ok', message: `Found ${matches.length} files with matches` });
        }
      } catch (err) {
        result = `Error: ${(err as Error).message}`;
        logToolEvent({ type: 'shell', target: fnName, status: 'error', message: (err as Error).message });
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: fnName,
        content: result
      });
    }
  }

  // Fallback if loop ends without report
  return {
    objective,
    summary: "Investigation timed out or reached max turns.",
    details: "The agent did not submit a final report in time.",
    evidence: []
  };
}
