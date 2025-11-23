import { createDefaultLLMClient, LLMMessage } from '../llm';
import { listDocFiles, readDocFile, searchFiles } from '../fsTools';
import { InvestigationConfig, InvestigationObjective, InvestigationResult, EvidenceItem } from './types';
import { logToolEvent } from '../../cli/ui';
import { MemoryManager } from '../memory/memory';
import chalk from 'chalk';

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
      description: 'List files in a directory. Use "." to list root. By default it is shallow (non-recursive) to save tokens. Set recursive=true only if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The directory path (default: .)' },
          recursive: { type: 'boolean', description: 'Whether to list recursively (default: false)' },
          depth: { type: 'number', description: 'Max depth for recursion (default: 2)' }
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
      name: 'update_memory',
      description: 'Update the persistent product memory with new findings.',
      parameters: {
        type: 'object',
        properties: {
          identity: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              stack: { type: 'string' },
              vision: { type: 'string' }
            }
          },
          addRisk: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              mitigation: { type: 'string' }
            }
          }
        }
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
  const memoryManager = new MemoryManager(process.cwd());
  const memory = await memoryManager.load();
  const startTime = Date.now();

  const systemPrompt = `
You are a Codebase Investigator for pmx.
Your goal is to answer the user's objective by exploring the codebase.

OBJECTIVE: "${objective.text}"

CURRENT MEMORY:
Identity: ${JSON.stringify(memory.identity)}
Risks: ${JSON.stringify(memory.risks)}

GUIDELINES:
1. Start by listing files in root ('.') to understand the structure.
2. Explore interesting directories one by one. Do NOT list the entire drive recursively at once.
3. Use 'search_files' to find keywords.
4. Use 'read_file' to examine relevant code.
5. If you find new information about the project identity or risks, use 'update_memory'.
6. Accumulate evidence.
7. When you have enough information, call 'submit_report'.
8. Do not hallucinate files. Only use what you see.
9. Be efficient. You have a limited number of turns.

You cannot modify files. You are read-only.

IMPORTANT: Before calling any tool, you MUST explain your reasoning in the response content. Tell the user what you are thinking and why you are choosing this tool.
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

    // Display Thinking
    if (content) {
      console.log(chalk.dim(`\n💭  ${content.replace(/\n/g, '\n    ')}`));
    }

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
          const targetPath = args.path || '.';
          const recursive = args.recursive || false;
          const depth = args.depth || 2;

          const files = await listDocFiles(process.cwd(), targetPath, recursive, depth);

          // Truncate if too many files
          let fileList = files.join('\n');
          if (files.length > 100) {
            fileList = files.slice(0, 100).join('\n') + `\n... (${files.length - 100} more files)`;
          }

          result = fileList;
          logToolEvent({ type: 'readFolder', target: targetPath, status: 'ok', message: `Found ${files.length} files` });
        } else if (fnName === 'search_files') {
          const matches = await searchFiles(process.cwd(), args.pattern);
          result = JSON.stringify(matches, null, 2);
          logToolEvent({ type: 'shell', target: `grep "${args.pattern}"`, status: 'ok', message: `Found ${matches.length} files with matches` });
        } else if (fnName === 'update_memory') {
          if (args.identity) {
            await memoryManager.updateIdentity(args.identity);
            result += 'Identity updated. ';
          }
          if (args.addRisk) {
            // We don't have a direct addRisk method yet, let's just load/save
            const mem = await memoryManager.load();
            mem.risks.push(args.addRisk);
            await memoryManager.save(mem);
            result += 'Risk added. ';
          }
          logToolEvent({ type: 'shell', target: 'memory', status: 'ok', message: 'Context updated.' });
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
