import { createDefaultLLMClient, LLMMessage } from '../llm';
import { readDocFile, prepareDocWrite, applyPendingWrite } from '../fsTools';
import { logToolEvent, promptForWriteConfirmation } from '../../cli/ui';
import * as path from 'path';

export interface Ticket {
    summary: string;
    description: string;
    type: 'Task' | 'Story' | 'Bug';
    priority: 'Low' | 'Medium' | 'High';
    estimate: string;
}

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'generate_tickets',
            description: 'Generate a list of tickets from the PRD.',
            parameters: {
                type: 'object',
                properties: {
                    tickets: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                summary: { type: 'string' },
                                description: { type: 'string' },
                                type: { type: 'string', enum: ['Task', 'Story', 'Bug'] },
                                priority: { type: 'string', enum: ['Low', 'Medium', 'High'] },
                                estimate: { type: 'string', description: 'T-shirt size or hours' }
                            },
                            required: ['summary', 'description', 'type', 'priority']
                        }
                    }
                },
                required: ['tickets']
            }
        }
    }
];

export async function runTicketFlow(
    prdPath: string
): Promise<{ path: string; count: number }> {
    const llm = createDefaultLLMClient();

    // Read the PRD
    let prdContent = '';
    try {
        const doc = await readDocFile(process.cwd(), prdPath);
        prdContent = doc.content;
        logToolEvent({ type: 'readFile', target: prdPath, status: 'ok', message: 'PRD loaded.' });
    } catch (e) {
        throw new Error(`Could not read PRD at ${prdPath}`);
    }

    const systemPrompt = `
You are a Technical Project Manager.
Your goal is to break down the following Product Requirements Document (PRD) into actionable engineering tickets.

PRD CONTENT:
${prdContent}

INSTRUCTIONS:
1. Analyze the "Technical Implementation Plan" and "User Stories".
2. Break the work down into granular tickets (Tasks, Stories).
3. Use 'generate_tickets' to return the list.
4. Be specific in the description.
`;

    const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt }
    ];

    const response = await llm.chat(messages, TOOLS);
    const toolCalls = response.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
        throw new Error('Agent failed to generate tickets.');
    }

    const toolCall = toolCalls.find(tc => tc.function.name === 'generate_tickets');
    if (!toolCall) {
        throw new Error('Agent did not call generate_tickets.');
    }

    const args = JSON.parse(toolCall.function.arguments);
    const tickets: Ticket[] = args.tickets;

    // Convert to CSV
    const csvHeader = 'Summary,Description,Type,Priority,Estimate\n';
    const csvRows = tickets.map(t => {
        const safeSummary = t.summary.replace(/,/g, ' ');
        const safeDesc = t.description.replace(/"/g, '""').replace(/\n/g, ' ');
        return `${safeSummary},"${safeDesc}",${t.type},${t.priority},${t.estimate || ''}`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Determine output path
    const prdName = path.basename(prdPath, '.md');
    const outputPath = `docs/tickets/${prdName}-tickets.csv`;

    const pending = await prepareDocWrite(process.cwd(), outputPath, csvContent, `Generate tickets for ${prdName}`);
    const status = await promptForWriteConfirmation(pending);

    if (status === 'approved') {
        await applyPendingWrite(process.cwd(), pending);
        logToolEvent({ type: 'writeFile', target: outputPath, status: 'ok', message: `Generated ${tickets.length} tickets.` });
        return { path: outputPath, count: tickets.length };
    } else {
        throw new Error('User rejected ticket generation.');
    }
}
