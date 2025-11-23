import { createDefaultLLMClient, LLMMessage } from '../llm';
import { readDocFile, prepareDocWrite, applyPendingWrite } from '../fsTools';
import { logToolEvent, promptForWriteConfirmation } from '../../cli/ui';
import * as path from 'path';

export interface Ticket {
    title: string;
    description: string;
    type: 'task' | 'story' | 'bug';
    priority: 'high' | 'medium' | 'low';
    estimate: string;
    acceptanceCriteria: string[];
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
`;

    const prompt = `
    You are an Engineering Manager.
    Break down the following PRD into actionable engineering tickets.

    PRD:
    ${prdContent}

    Return a JSON array of tickets. Each ticket must have:
    - title: Concise summary
    - description: Detailed technical instructions
    - type: 'task', 'story', or 'bug'
    - priority: 'high', 'medium', 'low'
    - estimate: T-shirt size (S, M, L, XL)
    - acceptanceCriteria: An array of 3-5 binary (pass/fail) conditions.

    Example:
    [
      {
        "title": "Setup Database",
        "description": "...",
        "type": "task",
        "priority": "high",
        "estimate": "M",
        "acceptanceCriteria": ["Schema created", "Migrations run", "Seed data loaded"]
      }
    ]
    `;

    const response = await llm.chat([{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }]);
    const jsonStr = response.content?.match(/\[[\s\S]*\]/)?.[0];

    if (!jsonStr) throw new Error("Failed to generate tickets");

    const tickets: Ticket[] = JSON.parse(jsonStr);

    // Convert to CSV
    const csvHeader = 'Title,Type,Priority,Estimate,Description,Acceptance Criteria\n';
    const csvRows = tickets.map(t => {
        const safeDesc = t.description.replace(/"/g, '""').replace(/\n/g, ' ');
        const safeAC = t.acceptanceCriteria.map(ac => `- ${ac} `).join('; ').replace(/"/g, '""');
        return `"${t.title}", "${t.type}", "${t.priority}", "${t.estimate}", "${safeDesc}", "${safeAC}"`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    // Determine output path
    const prdName = path.basename(prdPath, '.md');
    const outputPath = path.join('docs/tickets', `${prdName} -tickets.csv`);

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
