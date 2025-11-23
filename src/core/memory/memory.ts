import * as fs from 'fs/promises';
import * as path from 'path';
import { logToolEvent } from '../../cli/ui';

export interface UserPersona {
    role: string;
    goals: string[];
    painPoints: string[];
}

export interface DecisionLog {
    date: string;
    title: string;
    context: string;
    decision: string;
    status: 'proposed' | 'accepted' | 'rejected' | 'deprecated';
}

export interface FeatureSummary {
    title: string;
    path: string;
    status: 'planned' | 'in-progress' | 'completed';
    lastUpdated: string;
}

export interface Risk {
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    mitigation: string;
}

export interface ProductMemory {
    identity: {
        name: string;
        stack: string;
        vision: string;
        lastUpdated: string;
    };
    personas: UserPersona[];
    decisions: DecisionLog[];
    features: { [slug: string]: FeatureSummary };
    risks: Risk[];
}

const DEFAULT_MEMORY: ProductMemory = {
    identity: { name: '', stack: '', vision: '', lastUpdated: '' },
    personas: [],
    decisions: [],
    features: {},
    risks: []
};

export class MemoryManager {
    private projectRoot: string;
    private memoryPath: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.memoryPath = path.join(projectRoot, '.pmx', 'memory.json');
    }

    async load(): Promise<ProductMemory> {
        try {
            const content = await fs.readFile(this.memoryPath, 'utf-8');
            const data = JSON.parse(content);
            return { ...DEFAULT_MEMORY, ...data };
        } catch (error) {
            return { ...DEFAULT_MEMORY };
        }
    }

    async save(memory: ProductMemory): Promise<void> {
        try {
            const dir = path.dirname(this.memoryPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.memoryPath, JSON.stringify(memory, null, 2), 'utf-8');
            logToolEvent({ type: 'writeFile', target: '.pmx/memory.json', status: 'ok', message: 'Memory updated.' });
        } catch (error) {
            console.error('Failed to save memory:', error);
        }
    }

    async updateIdentity(identity: Partial<ProductMemory['identity']>): Promise<void> {
        const memory = await this.load();
        memory.identity = { ...memory.identity, ...identity, lastUpdated: new Date().toISOString() };
        await this.save(memory);
    }

    async addDecision(decision: Omit<DecisionLog, 'date'>): Promise<void> {
        const memory = await this.load();
        memory.decisions.push({ ...decision, date: new Date().toISOString() });
        await this.save(memory);
    }
}
