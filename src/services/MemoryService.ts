import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface PMXMemory {
    // Identity (synced from context)
    identity: {
        name: string;
        oneLiner: string;
        domain: string;
        stack: string;
    };

    // Strategic Goals
    okrs: OKR[];

    // Decision Log
    decisions: Decision[];

    // Risk Register
    risks: Risk[];

    // User Personas
    personas: Persona[];

    // Auto-generated Insights
    insights: Insight[];

    // Metadata
    lastUpdated: string;
    version: string;
}

export interface OKR {
    id: string;
    objective: string;
    keyResults: KeyResult[];
    quarter: string; // e.g., "Q1 2025"
    status: 'on-track' | 'at-risk' | 'off-track' | 'completed';
    createdAt: string;
}

export interface KeyResult {
    id: string;
    description: string;
    target: number;
    current: number;
    unit: string; // e.g., "users", "%", "$"
}

export interface Decision {
    id: string;
    date: string;
    title: string;
    context: string;
    decision: string;
    rationale: string;
    alternatives: string[];
    outcome?: string;
    tags: string[];
}

export interface Risk {
    id: string;
    title: string;
    description: string;
    likelihood: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
    status: 'open' | 'mitigated' | 'accepted';
    relatedFiles?: string[];
    createdAt: string;
}

export interface Persona {
    id: string;
    name: string;
    role: string;
    goals: string[];
    painPoints: string[];
    behaviors: string[];
}

export interface Insight {
    id: string;
    date: string;
    type: 'architecture' | 'pattern' | 'warning' | 'opportunity';
    content: string;
    source: 'agent' | 'user';
    relatedFiles?: string[];
}

// ═══════════════════════════════════════════════════════════════
// MEMORY SERVICE
// ═══════════════════════════════════════════════════════════════

export class MemoryService {
    private memoryPath: string;
    private memory: PMXMemory | null = null;

    constructor(private rootDir: string = process.cwd()) {
        this.memoryPath = path.join(rootDir, '.pmx', 'memory.json');
    }

    // ─────────────────────────────────────────────────────────────
    // Core Persistence
    // ─────────────────────────────────────────────────────────────

    private getEmptyMemory(): PMXMemory {
        return {
            identity: {
                name: 'Unknown',
                oneLiner: '',
                domain: '',
                stack: ''
            },
            okrs: [],
            decisions: [],
            risks: [],
            personas: [],
            insights: [],
            lastUpdated: new Date().toISOString(),
            version: '1.0.0'
        };
    }

    async loadMemory(): Promise<PMXMemory> {
        if (this.memory) return this.memory;

        try {
            if (await fs.pathExists(this.memoryPath)) {
                this.memory = await fs.readJson(this.memoryPath);
                return this.memory!;
            }
        } catch (e) {
            console.error('Failed to load memory:', e);
        }

        this.memory = this.getEmptyMemory();
        return this.memory;
    }

    async saveMemory(): Promise<void> {
        if (!this.memory) return;

        this.memory.lastUpdated = new Date().toISOString();
        await fs.ensureDir(path.dirname(this.memoryPath));
        await fs.writeJson(this.memoryPath, this.memory, { spaces: 2 });
    }

    async initializeMemory(identity: PMXMemory['identity']): Promise<void> {
        await this.loadMemory();
        this.memory!.identity = identity;
        await this.saveMemory();
    }

    // ─────────────────────────────────────────────────────────────
    // OKR Management
    // ─────────────────────────────────────────────────────────────

    async addOKR(objective: string, quarter?: string): Promise<OKR> {
        await this.loadMemory();

        const okr: OKR = {
            id: uuidv4(),
            objective,
            keyResults: [],
            quarter: quarter || this.getCurrentQuarter(),
            status: 'on-track',
            createdAt: new Date().toISOString()
        };

        this.memory!.okrs.push(okr);
        await this.saveMemory();
        return okr;
    }

    async addKeyResult(okrId: string, description: string, target: number, unit: string): Promise<KeyResult | null> {
        await this.loadMemory();

        const okr = this.memory!.okrs.find(o => o.id === okrId);
        if (!okr) return null;

        const kr: KeyResult = {
            id: uuidv4(),
            description,
            target,
            current: 0,
            unit
        };

        okr.keyResults.push(kr);
        await this.saveMemory();
        return kr;
    }

    async updateOKRStatus(okrId: string, status: OKR['status']): Promise<boolean> {
        await this.loadMemory();

        const okr = this.memory!.okrs.find(o => o.id === okrId);
        if (!okr) return false;

        okr.status = status;
        await this.saveMemory();
        return true;
    }

    async getOKRs(): Promise<OKR[]> {
        await this.loadMemory();
        return this.memory!.okrs;
    }

    private getCurrentQuarter(): string {
        const now = new Date();
        const quarter = Math.floor(now.getMonth() / 3) + 1;
        return `Q${quarter} ${now.getFullYear()}`;
    }

    // ─────────────────────────────────────────────────────────────
    // Decision Log
    // ─────────────────────────────────────────────────────────────

    async logDecision(data: Omit<Decision, 'id' | 'date'>): Promise<Decision> {
        await this.loadMemory();

        const decision: Decision = {
            id: uuidv4(),
            date: new Date().toISOString(),
            ...data
        };

        this.memory!.decisions.push(decision);
        await this.saveMemory();
        return decision;
    }

    async getDecisions(limit?: number): Promise<Decision[]> {
        await this.loadMemory();
        const decisions = [...this.memory!.decisions].reverse(); // Most recent first
        return limit ? decisions.slice(0, limit) : decisions;
    }

    async searchDecisions(query: string): Promise<Decision[]> {
        await this.loadMemory();
        const lowerQuery = query.toLowerCase();
        return this.memory!.decisions.filter(d =>
            d.title.toLowerCase().includes(lowerQuery) ||
            d.decision.toLowerCase().includes(lowerQuery) ||
            d.tags.some(t => t.toLowerCase().includes(lowerQuery))
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Risk Register
    // ─────────────────────────────────────────────────────────────

    async addRisk(data: Omit<Risk, 'id' | 'createdAt'>): Promise<Risk> {
        await this.loadMemory();

        const risk: Risk = {
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            ...data
        };

        this.memory!.risks.push(risk);
        await this.saveMemory();
        return risk;
    }

    async updateRiskStatus(riskId: string, status: Risk['status']): Promise<boolean> {
        await this.loadMemory();

        const risk = this.memory!.risks.find(r => r.id === riskId);
        if (!risk) return false;

        risk.status = status;
        await this.saveMemory();
        return true;
    }

    async getRisks(filter?: { status?: Risk['status'] }): Promise<Risk[]> {
        await this.loadMemory();
        let risks = this.memory!.risks;

        if (filter?.status) {
            risks = risks.filter(r => r.status === filter.status);
        }

        return risks;
    }

    async getOpenRisks(): Promise<Risk[]> {
        return this.getRisks({ status: 'open' });
    }

    // ─────────────────────────────────────────────────────────────
    // Persona Management
    // ─────────────────────────────────────────────────────────────

    async addPersona(data: Omit<Persona, 'id'>): Promise<Persona> {
        await this.loadMemory();

        const persona: Persona = {
            id: uuidv4(),
            ...data
        };

        this.memory!.personas.push(persona);
        await this.saveMemory();
        return persona;
    }

    async getPersonas(): Promise<Persona[]> {
        await this.loadMemory();
        return this.memory!.personas;
    }

    // ─────────────────────────────────────────────────────────────
    // Insight Collection
    // ─────────────────────────────────────────────────────────────

    async addInsight(data: Omit<Insight, 'id' | 'date'>): Promise<Insight> {
        await this.loadMemory();

        const insight: Insight = {
            id: uuidv4(),
            date: new Date().toISOString(),
            ...data
        };

        this.memory!.insights.push(insight);
        await this.saveMemory();
        return insight;
    }

    async getInsights(type?: Insight['type']): Promise<Insight[]> {
        await this.loadMemory();
        let insights = this.memory!.insights;

        if (type) {
            insights = insights.filter(i => i.type === type);
        }

        return insights;
    }

    // ─────────────────────────────────────────────────────────────
    // Context for Agent
    // ─────────────────────────────────────────────────────────────

    async getContextForAgent(): Promise<string> {
        await this.loadMemory();
        const m = this.memory!;

        const sections: string[] = [];

        // Identity
        if (m.identity.name !== 'Unknown') {
            sections.push(`PRODUCT: ${m.identity.name} - ${m.identity.oneLiner}`);
        }

        // OKRs
        if (m.okrs.length > 0) {
            const okrLines = m.okrs.map(o => {
                const krSummary = o.keyResults.length > 0
                    ? ` (${o.keyResults.length} key results)`
                    : '';
                return `  • [${o.status.toUpperCase()}] ${o.objective}${krSummary}`;
            });
            sections.push(`CURRENT OKRS (${this.getCurrentQuarter()}):\n${okrLines.join('\n')}`);
        }

        // Open Risks
        const openRisks = m.risks.filter(r => r.status === 'open');
        if (openRisks.length > 0) {
            const riskLines = openRisks.map(r =>
                `  • [${r.likelihood.toUpperCase()}/${r.impact.toUpperCase()}] ${r.title}`
            );
            sections.push(`OPEN RISKS:\n${riskLines.join('\n')}`);
        }

        // Recent Decisions (last 3)
        if (m.decisions.length > 0) {
            const recent = m.decisions.slice(-3).reverse();
            const decisionLines = recent.map(d =>
                `  • ${d.title}: ${d.decision}`
            );
            sections.push(`RECENT DECISIONS:\n${decisionLines.join('\n')}`);
        }

        // Personas
        if (m.personas.length > 0) {
            const personaNames = m.personas.map(p => p.name).join(', ');
            sections.push(`TARGET PERSONAS: ${personaNames}`);
        }

        // Recent Insights (last 3)
        const recentInsights = m.insights.slice(-3).reverse();
        if (recentInsights.length > 0) {
            const insightLines = recentInsights.map(i =>
                `  • [${i.type.toUpperCase()}] ${i.content}`
            );
            sections.push(`RECENT INSIGHTS:\n${insightLines.join('\n')}`);
        }

        return sections.length > 0
            ? sections.join('\n\n')
            : 'No strategic context available yet. Run /init to set up.';
    }

    // ─────────────────────────────────────────────────────────────
    // Summary for UI
    // ─────────────────────────────────────────────────────────────

    async getSummary(): Promise<{
        hasIdentity: boolean;
        okrCount: number;
        decisionCount: number;
        openRiskCount: number;
        personaCount: number;
        insightCount: number;
    }> {
        await this.loadMemory();
        const m = this.memory!;

        return {
            hasIdentity: m.identity.name !== 'Unknown',
            okrCount: m.okrs.length,
            decisionCount: m.decisions.length,
            openRiskCount: m.risks.filter(r => r.status === 'open').length,
            personaCount: m.personas.length,
            insightCount: m.insights.length
        };
    }
}
