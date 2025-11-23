import { createDefaultLLMClient, LLMMessage } from '../llm';
import { prepareDocWrite, applyPendingWrite, readDocFile } from '../fsTools';
import { logToolEvent, promptForWriteConfirmation } from '../../cli/ui';
import { MemoryManager } from '../memory/memory';
import * as path from 'path';

const ROADMAP_PATH = 'docs/ROADMAP.md';

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'read_roadmap',
            description: 'Read the current content of the roadmap.',
            parameters: { type: 'object', properties: {}, required: [] }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_roadmap',
            description: 'Update the roadmap content.',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The new full markdown content for the roadmap.' },
                    reason: { type: 'string', description: 'Why this change is being made.' }
                },
                required: ['content', 'reason']
            }
        }
    }
];

export async function runRoadmapFlow(
    request: string,
    config: { maxTurns: number } = { maxTurns: 5 }
): Promise<{ summary: string }> {
    const llm = createDefaultLLMClient();
    const memoryManager = new MemoryManager(process.cwd());
    const memory = await memoryManager.load();

    const systemPrompt = `
You are the Product Strategy Lead.
Your goal is to manage the product roadmap in '${ROADMAP_PATH}'.

USER REQUEST: "${request}"

CONTEXT:
Project: ${memory.identity.name}
Vision: ${memory.identity.vision}

INSTRUCTIONS:
1. Read the current roadmap using 'read_roadmap'.
2. If it doesn't exist, propose a new structure based on the Project Vision.
3. Analyze the User Request and modify the roadmap accordingly.
   - Add new items.
   - Mark items as done.
   - Reorder priorities.
4. Use 'update_roadmap' to save changes.
5. Be strategic. Group items by milestones (e.g., "Phase 1: MVP", "Phase 2: Scale").
`;

    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt }
    ];

    let turns = 0;
    let summary = '';

    while (turns < config.maxTurns) {
        turns++;

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
                break;
            }
            continue;
        }

        for (const toolCall of toolCalls) {
            const fnName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            let result = '';

            if (fnName === 'read_roadmap') {
                try {
                    const doc = await readDocFile(process.cwd(), ROADMAP_PATH);
                    result = doc.content;
                    logToolEvent({ type: 'readFile', target: ROADMAP_PATH, status: 'ok', message: 'Roadmap loaded.' });
                } catch (e) {
                    result = "Roadmap file does not exist yet. You should create it.";
                    logToolEvent({ type: 'readFile', target: ROADMAP_PATH, status: 'error', message: 'No roadmap found.' });
                }
            } else if (fnName === 'update_roadmap') {
                try {
                    const pending = await prepareDocWrite(process.cwd(), ROADMAP_PATH, args.content, args.reason);
                    const status = await promptForWriteConfirmation(pending);

                    if (status === 'approved') {
                        await applyPendingWrite(process.cwd(), pending);
                        result = "Roadmap updated successfully.";
                        summary = `Updated roadmap: ${args.reason}`;
                        logToolEvent({ type: 'writeFile', target: ROADMAP_PATH, status: 'ok', message: 'Roadmap saved.' });
                        return { summary };
                    } else {
                        result = "User rejected the update.";
                        logToolEvent({ type: 'writeFile', target: ROADMAP_PATH, status: 'cancelled', message: 'User rejected.' });
                    }
                } catch (e) {
                    result = `Error updating roadmap: ${(e as Error).message}`;
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

    return { summary: summary || "No changes made to roadmap." };
}
